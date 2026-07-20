import {
  MICROSOFT_TODO_EXTENSION_NAME,
  MICROSOFT_TODO_GRAPH_TIME_ZONE,
  MICROSOFT_TODO_LIST_NAME,
  MicrosoftTodoGatewayError,
  microsoftTodoListSnapshotV1Schema,
  microsoftTodoProjectionV1Schema,
  uuidV1Schema,
} from '@meridian/domain';
import type {
  MicrosoftTodoFailureClass,
  MicrosoftTodoGateway,
  MicrosoftTodoListSnapshot,
  MicrosoftTodoProjection,
  Uuid,
} from '@meridian/domain';

const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';
const GRAPH_TIMEOUT_MS = 10_000;

function listPath(listId?: string): string {
  return listId === undefined
    ? '/me/todo/lists'
    : `/me/todo/lists/${encodeURIComponent(listId)}`;
}

function taskPath(listId: string, taskId?: string): string {
  const base = `${listPath(listId)}/tasks`;
  return taskId === undefined ? base : `${base}/${encodeURIComponent(taskId)}`;
}

function failureFor(status: number): MicrosoftTodoFailureClass {
  if (status === 401 || status === 403) return 'authorization_revoked';
  if (status === 404) return 'not_found';
  if (status === 409 || status === 412) return 'conflict';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'uncertain_outcome';
  return 'validation_failed';
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new MicrosoftTodoGatewayError('validation_failed');
  return value as Readonly<Record<string, unknown>>;
}

function markerFromExtensions(value: unknown): Uuid | null {
  if (!Array.isArray(value)) return null;
  for (const item of value) {
    const candidate = record(item);
    if (
      candidate.extensionName === MICROSOFT_TODO_EXTENSION_NAME &&
      typeof candidate.ownershipMarker === 'string'
    )
      return uuidV1Schema.parse(candidate.ownershipMarker);
  }
  return null;
}

function listSnapshot(value: unknown): MicrosoftTodoListSnapshot {
  const candidate = record(value);
  return microsoftTodoListSnapshotV1Schema.parse({
    displayName: candidate.displayName,
    id: candidate.id,
    isOwner: candidate.isOwner,
    isShared: candidate.isShared,
    ownershipMarker: markerFromExtensions(candidate.extensions),
    wellknownListName: candidate.wellknownListName,
  });
}

function collection(value: unknown): readonly unknown[] {
  const candidate = record(value);
  if (!Array.isArray(candidate.value))
    throw new MicrosoftTodoGatewayError('validation_failed');
  return candidate.value;
}

function taskResult(value: unknown): {
  readonly id: string;
  readonly etag: string | null;
} {
  const candidate = record(value);
  if (typeof candidate.id !== 'string' || candidate.id.length === 0)
    throw new MicrosoftTodoGatewayError('validation_failed');
  const etag = candidate['@odata.etag'];
  if (etag !== undefined && typeof etag !== 'string')
    throw new MicrosoftTodoGatewayError('validation_failed');
  return { etag: etag ?? null, id: candidate.id };
}

function projectionBody(
  projectionInput: MicrosoftTodoProjection,
): Readonly<Record<string, unknown>> {
  const projection = microsoftTodoProjectionV1Schema.parse(projectionInput);
  const localDateTime = (value: string): string => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
      hourCycle: 'h23',
      minute: '2-digit',
      month: '2-digit',
      second: '2-digit',
      timeZone: projection.timeZone,
      year: 'numeric',
    })
      .formatToParts(new Date(value))
      .reduce<Record<string, string>>((result, part) => {
        if (part.type !== 'literal') result[part.type] = part.value;
        return result;
      }, {});
    const { day, hour, minute, month, second, year } = parts;
    if (!day || !hour || !minute || !month || !second || !year)
      throw new MicrosoftTodoGatewayError('validation_failed');
    return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  };
  return {
    ...(projection.dueAt === null
      ? {}
      : {
          dueDateTime: {
            dateTime: localDateTime(projection.dueAt),
            timeZone: MICROSOFT_TODO_GRAPH_TIME_ZONE,
          },
        }),
    isReminderOn: true,
    recurrence: null,
    reminderDateTime: {
      dateTime: localDateTime(projection.reminderAt),
      timeZone: MICROSOFT_TODO_GRAPH_TIME_ZONE,
    },
    title: projection.title,
  };
}

export class MicrosoftTodoHttpGateway implements MicrosoftTodoGateway {
  public constructor(private readonly fetcher: typeof fetch = fetch) {}

  public async listLists(
    accessToken: string,
  ): Promise<readonly MicrosoftTodoListSnapshot[]> {
    const response = await this.request(
      `${listPath()}?$select=id,displayName,isOwner,isShared,wellknownListName&$expand=extensions`,
      accessToken,
      { method: 'GET' },
    );
    return collection(await response.json()).map(listSnapshot);
  }

  public async createListAtomically(
    accessToken: string,
    ownershipMarker: Uuid,
  ): Promise<MicrosoftTodoListSnapshot> {
    const response = await this.request(
      listPath(),
      accessToken,
      {
        body: JSON.stringify({
          displayName: MICROSOFT_TODO_LIST_NAME,
          extensions: [
            {
              '@odata.type': 'microsoft.graph.openTypeExtension',
              extensionName: MICROSOFT_TODO_EXTENSION_NAME,
              ownershipMarker,
            },
          ],
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
      true,
    );
    return listSnapshot(await response.json());
  }

  public async createList(
    accessToken: string,
  ): Promise<MicrosoftTodoListSnapshot> {
    const response = await this.request(listPath(), accessToken, {
      body: JSON.stringify({ displayName: MICROSOFT_TODO_LIST_NAME }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    const value = record(await response.json());
    return microsoftTodoListSnapshotV1Schema.parse({
      displayName: value.displayName,
      id: value.id,
      isOwner: value.isOwner ?? true,
      isShared: value.isShared ?? false,
      ownershipMarker: null,
      wellknownListName: value.wellknownListName ?? 'none',
    });
  }

  public async addListOwnershipMarker(
    accessToken: string,
    listId: string,
    ownershipMarker: Uuid,
  ): Promise<MicrosoftTodoListSnapshot> {
    await this.request(`${listPath(listId)}/extensions`, accessToken, {
      body: JSON.stringify({
        '@odata.type': 'microsoft.graph.openTypeExtension',
        extensionName: MICROSOFT_TODO_EXTENSION_NAME,
        ownershipMarker,
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    return this.getList(accessToken, listId);
  }

  public async getList(
    accessToken: string,
    listId: string,
  ): Promise<MicrosoftTodoListSnapshot> {
    const response = await this.request(
      `${listPath(listId)}?$select=id,displayName,isOwner,isShared,wellknownListName&$expand=extensions`,
      accessToken,
      { method: 'GET' },
    );
    return listSnapshot(await response.json());
  }

  public async createTask(
    accessToken: string,
    listId: string,
    projection: MicrosoftTodoProjection,
    ownershipMarker: Uuid,
  ): Promise<{ readonly id: string; readonly etag: string | null }> {
    const response = await this.request(taskPath(listId), accessToken, {
      body: JSON.stringify({
        ...projectionBody(projection),
        linkedResources: [
          {
            applicationName: 'Meridian',
            displayName: `Meridian occurrence ${ownershipMarker}`,
          },
        ],
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    return taskResult(await response.json());
  }

  public async updateTask(
    accessToken: string,
    listId: string,
    taskId: string,
    projection: MicrosoftTodoProjection,
  ): Promise<{ readonly etag: string | null }> {
    const response = await this.request(taskPath(listId, taskId), accessToken, {
      body: JSON.stringify(projectionBody(projection)),
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    });
    return taskResult(await response.json());
  }

  public async deleteTask(
    accessToken: string,
    listId: string,
    taskId: string,
  ): Promise<void> {
    await this.request(taskPath(listId, taskId), accessToken, {
      method: 'DELETE',
    });
  }

  public async findTasksByOwnershipMarker(
    accessToken: string,
    listId: string,
    ownershipMarker: Uuid,
  ): Promise<readonly { readonly id: string; readonly etag: string | null }[]> {
    const response = await this.request(
      `${taskPath(listId)}?$select=id&$expand=linkedResources`,
      accessToken,
      { method: 'GET' },
    );
    const expected = `Meridian occurrence ${ownershipMarker}`;
    return collection(await response.json()).flatMap((value) => {
      const candidate = record(value);
      const linked = Array.isArray(candidate.linkedResources)
        ? candidate.linkedResources
        : [];
      const match = linked.some((item) => {
        const resource = record(item);
        return (
          resource.applicationName === 'Meridian' &&
          resource.displayName === expected
        );
      });
      return match ? [taskResult(candidate)] : [];
    });
  }

  private async request(
    path: string,
    accessToken: string,
    init: RequestInit,
    atomicExtension = false,
  ): Promise<Response> {
    let response: Response;
    try {
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${accessToken}`);
      response = await this.fetcher(`${GRAPH_ROOT}${path}`, {
        ...init,
        headers,
        signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
      });
    } catch {
      throw new MicrosoftTodoGatewayError('uncertain_outcome');
    }
    if (!response.ok) {
      if (atomicExtension && response.status === 400)
        throw new MicrosoftTodoGatewayError('atomic_extension_unsupported');
      throw new MicrosoftTodoGatewayError(failureFor(response.status));
    }
    return response;
  }
}
