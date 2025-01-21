// @ts-nocheck
////////////////////////////////////////////////////////////////
import { useFlow } from '@pgflow/react';
import { ProcessVoiceTicket } from "flows/ProcessVoiceTicket.ts";

export const VoiceTicketProcessor = () => {
  const [ticket, setTicket] = useState(null);
  const { flow } = useFlow(ProcessVoiceTicket); // Auto-triggers on mount

  // Type-safe event handling
  flow.on('newTicket:completed', ({ ticket }) => setTicket(ticket));

  return ticket ? (
    <div>
      {ticket.title} - {ticket.severity === 'high' && '⚠️ High Priority'}
    </div>
  ) : 'Processing...';
};
