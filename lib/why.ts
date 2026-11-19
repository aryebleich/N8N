/** Plain-language explanations of why the assistant answered or asked a person. */
export const WHY: Record<string, { title: string; text: string }> = {
  auto: { title: 'Answered automatically', text: 'Both AIs were sure enough, agreed with each other, and no safety rule stopped the reply.' },
  low_confidence: { title: 'Not sure enough', text: 'At least one AI was less sure than your confidence level, so it asked a person instead of guessing.' },
  models_disagree: { title: 'The two AIs disagreed', text: 'The second AI (the checker) found a problem with the first draft, so a person should look.' },
  unusual_question: { title: 'Unusual question', text: 'Your answers do not cover this question, so the assistant asked a person instead of making something up.' },
  parse_error: { title: 'An AI gave an unusable reply', text: 'One AI did not answer in the expected format (or timed out), so the message went to a person to be safe.' },
  system_error: { title: 'Something broke', text: 'A service did not respond. The customer got a holding reply and a person was asked to help.' },
  kill_switch: { title: 'The assistant is switched off', text: 'Automatic replies are off (on the Home page or for this channel), so every message goes to a person.' },
  outside_hours: { title: 'Outside business hours', text: 'The message arrived while you were closed, so the customer got your "we are closed" message.' },
  blocked_keyword: { title: 'Blocked word', text: 'The message contains one of your blocked words, so a person always handles it.' },
  policy: { title: 'Safety rule', text: 'The draft broke a safety rule (for example, it mentioned account details or a card number), so it was not sent.' },
  delivery_failed: { title: 'The email could not be sent', text: 'The reply was ready but the email server refused it. A person should reply by hand.' },
};

export const whyFor = (reasonCode: string | null | undefined) => WHY[reasonCode || 'auto'] ?? WHY.low_confidence;
