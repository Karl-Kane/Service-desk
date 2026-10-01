import type { Priority, TicketStatus } from '@service-desk/api-client';
import { PRIORITY_LABELS, STATUS_LABELS } from '../lib/labels';

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={`badge status-${status}`} data-testid="ticket-status">
      {STATUS_LABELS[status]}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={`badge priority-${priority}`}>{PRIORITY_LABELS[priority]}</span>;
}
