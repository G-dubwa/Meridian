import type { NextRequest } from 'next/server';
import {
  getRetrievalStatus,
  postRetrievalPreview,
} from '../../_server/retrieval-http';

export const dynamic = 'force-dynamic';

export function GET(request: NextRequest) {
  return getRetrievalStatus(request);
}

export function POST(request: NextRequest) {
  return postRetrievalPreview(request);
}
