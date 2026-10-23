export interface GroupMember {
  userId: string;
  username: string;
  role: 'creator' | 'admin' | 'member';
  joinedAt: number;
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  creatorId: string;
  members: GroupMember[];
  createdAt: number;
  updatedAt: number;
  pinnedMessageIds: string[];
}
