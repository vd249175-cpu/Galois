export interface ChatMessage {
  id: string;
  sender: 'user' | 'agent' | 'system' | 'tool';
  text: string;
  timestamp: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
}
