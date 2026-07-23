import {
  getScheduling,
  postSchedulingProposal,
} from '../../_server/scheduling-http';

export const dynamic = 'force-dynamic';

export const GET = getScheduling;
export const POST = postSchedulingProposal;
