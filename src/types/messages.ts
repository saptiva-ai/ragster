import { ObjectId } from 'mongodb';

export interface Message {
  _id: string;
  message_id: string;
  message_role: string;
  model?: string;
  message: string;
  temperature?: number;
  max_tokens?: number;
  timestamp: string;
  user_id?: string;
  contact_name?: string;
}



export interface Lead {
  id: string;
  _id?: string | ObjectId;
  whatsappName: string;
  phoneNumber: string;
  email?: string;
  company?: string;
  quotation?: string;
  registrationDate: string;
  lastMessageDate?: string;
  conversationCount?: number;
  status: string;
  message_id?: string;
} 