import {
  MICROSOFT_TODO_EXTENSION_NAME,
  MicrosoftTodoGatewayError,
  assertManagedMicrosoftTodoListV1,
  reminderOccurrenceIdV1Schema,
  uuidV1Schema,
} from '../../packages/domain/src/index.js';
import { MicrosoftTodoHttpGateway } from '../../packages/infrastructure-ms-graph/src/todo.js';
import { describe, expect, it } from 'vitest';

const marker = uuidV1Schema.parse('018f0f77-34f1-7ef2-8ca1-7a3bf7f01976');
const occurrenceId = reminderOccurrenceIdV1Schema.parse(
  '018f0f77-34f1-7ef2-8ca1-7a3bf7f01977',
);

function listResponse(id = 'meridian-list', ownershipMarker = marker) {
  return {
    displayName: 'Meridian',
    extensions: [
      {
        extensionName: MICROSOFT_TODO_EXTENSION_NAME,
        ownershipMarker,
      },
    ],
    id,
    isOwner: true,
    isShared: false,
    wellknownListName: 'none',
  };
}

function requestUrl(input: string | URL | Request): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

function requestBody(init: RequestInit | undefined): unknown {
  if (typeof init?.body !== 'string')
    throw new Error('Expected a JSON string request body.');
  return JSON.parse(init.body);
}

describe('WP-11 constrained Microsoft To Do HTTP adapter', () => {
  it('attempts list and ownership-extension creation atomically without arbitrary user routes', async () => {
    const requests: {
      readonly body: unknown;
      readonly method: string;
      readonly url: string;
    }[] = [];
    const gateway = new MicrosoftTodoHttpGateway((input, init) => {
      requests.push({
        body: requestBody(init),
        method: init?.method ?? 'GET',
        url: requestUrl(input),
      });
      return Promise.resolve(Response.json(listResponse(), { status: 201 }));
    });
    await expect(
      gateway.createListAtomically('synthetic-token', marker),
    ).resolves.toMatchObject({
      id: 'meridian-list',
      ownershipMarker: marker,
    });
    expect(requests).toEqual([
      {
        body: {
          displayName: 'Meridian',
          extensions: [
            {
              '@odata.type': 'microsoft.graph.openTypeExtension',
              extensionName: MICROSOFT_TODO_EXTENSION_NAME,
              ownershipMarker: marker,
            },
          ],
        },
        method: 'POST',
        url: 'https://graph.microsoft.com/v1.0/me/todo/lists',
      },
    ]);
    expect(requests[0]?.url).not.toContain('/users/');
  });

  it('maps the exact instant to Johannesburg reminder and due fields with no native recurrence', async () => {
    let body: Readonly<Record<string, unknown>> | undefined;
    const gateway = new MicrosoftTodoHttpGateway((_input, init) => {
      body = requestBody(init) as Readonly<Record<string, unknown>>;
      return Promise.resolve(
        Response.json(
          { '@odata.etag': 'synthetic-etag', id: 'managed-task' },
          { status: 201 },
        ),
      );
    });
    await gateway.createTask(
      'synthetic-token',
      'stored-list-id',
      {
        dueAt: '2026-07-21T09:00:00.000Z',
        occurrenceId,
        recurrence: null,
        reminderAt: '2026-07-21T08:30:00.000Z',
        timeZone: 'Africa/Johannesburg',
        title: 'Meridian WP-11 TEST — safe to delete',
      },
      marker,
    );
    expect(body).toMatchObject({
      dueDateTime: {
        dateTime: '2026-07-21T11:00:00',
        timeZone: 'South Africa Standard Time',
      },
      isReminderOn: true,
      recurrence: null,
      reminderDateTime: {
        dateTime: '2026-07-21T10:30:00',
        timeZone: 'South Africa Standard Time',
      },
    });
    expect(body).not.toHaveProperty('startDateTime');
  });

  it('limits task recovery, update, and deletion to the supplied stored list path', async () => {
    const urls: string[] = [];
    const gateway = new MicrosoftTodoHttpGateway((input, init) => {
      const url = requestUrl(input);
      urls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.includes('?$select=id&$expand=linkedResources'))
        return Promise.resolve(
          Response.json({
            value: [
              {
                '@odata.etag': 'etag-1',
                id: 'managed-task',
                linkedResources: [
                  {
                    applicationName: 'Meridian',
                    displayName: `Meridian occurrence ${marker}`,
                  },
                ],
              },
              {
                id: 'unmanaged-task',
                linkedResources: [],
              },
            ],
          }),
        );
      if (init?.method === 'DELETE')
        return Promise.resolve(new Response(null, { status: 204 }));
      return Promise.resolve(
        Response.json({ '@odata.etag': 'etag-2', id: 'managed-task' }),
      );
    });
    await expect(
      gateway.findTasksByOwnershipMarker(
        'synthetic-token',
        'stored-list-id',
        marker,
      ),
    ).resolves.toEqual([{ etag: 'etag-1', id: 'managed-task' }]);
    await gateway.updateTask(
      'synthetic-token',
      'stored-list-id',
      'managed-task',
      {
        dueAt: null,
        occurrenceId,
        recurrence: null,
        reminderAt: '2026-07-21T08:30:00.000Z',
        timeZone: 'Africa/Johannesburg',
        title: 'Meridian WP-11 TEST — safe to delete',
      },
    );
    await gateway.deleteTask(
      'synthetic-token',
      'stored-list-id',
      'managed-task',
    );
    expect(urls).toHaveLength(3);
    expect(
      urls.every((url) => url.includes('/me/todo/lists/stored-list-id/tasks')),
    ).toBe(true);
    expect(urls.join(' ')).not.toContain('/users/');
  });

  it('fails closed for shared, unowned, mismatched, broadened, and uncertain outcomes', async () => {
    const containedList = {
      displayName: 'Meridian',
      id: 'meridian-list',
      isOwner: true,
      isShared: false,
      ownershipMarker: marker,
      wellknownListName: 'none' as const,
    };
    expect(() => {
      assertManagedMicrosoftTodoListV1(
        { ...containedList, isShared: true },
        'meridian-list',
        marker,
      );
    }).toThrow(/containment/);
    expect(() => {
      assertManagedMicrosoftTodoListV1(
        { ...containedList, isOwner: false },
        'meridian-list',
        marker,
      );
    }).toThrow(/containment/);
    expect(() => {
      assertManagedMicrosoftTodoListV1(
        { ...containedList, id: 'another-list' },
        'meridian-list',
        marker,
      );
    }).toThrow(/containment/);

    const atomicUnsupported = new MicrosoftTodoHttpGateway(() =>
      Promise.resolve(new Response(null, { status: 400 })),
    );
    await expect(
      atomicUnsupported.createListAtomically('synthetic-token', marker),
    ).rejects.toEqual(
      new MicrosoftTodoGatewayError('atomic_extension_unsupported'),
    );

    const uncertain = new MicrosoftTodoHttpGateway(() =>
      Promise.reject(new Error('diagnostic must not escape')),
    );
    await expect(
      uncertain.createTask(
        'synthetic-token',
        'stored-list-id',
        {
          dueAt: null,
          occurrenceId,
          recurrence: null,
          reminderAt: '2026-07-21T08:30:00.000Z',
          timeZone: 'Africa/Johannesburg',
          title: 'Meridian WP-11 TEST — safe to delete',
        },
        marker,
      ),
    ).rejects.toMatchObject({ failureClass: 'uncertain_outcome' });
  });
});
