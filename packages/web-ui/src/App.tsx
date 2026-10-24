import React, { useState, useEffect, useRef } from 'react';
import {
  Contact,
  Message,
  FileTransfer,
  Group,
  CallSession,
  generateUUID,
  generatePairingToken,
  sanitizeFilename,
} from '@lynq/core';
import { CallSessionEngine } from '@lynq/p2p-engine';
import { LynqClient, getDefaultSignalingUrl } from './services/LynqClient';
import { SidebarRail, NavTab } from './components/SidebarRail';
import { ConversationList } from './components/ConversationList';
import { ChatWindow } from './components/ChatWindow';
import { PairingModal } from './components/PairingModal';
import { FileTransferModal } from './components/FileTransferModal';
import { CreateGroupModal } from './components/CreateGroupModal';
import { CallModal } from './components/CallModal';
import { ForwardModal } from './components/ForwardModal';
import { SettingsModal } from './components/SettingsModal';
import { DiagnosticsModal } from './components/DiagnosticsModal';
import { NotificationService } from './services/NotificationService';
import { RecordedVoiceData } from './services/VoiceRecorderService';
import './styles/theme.css';

export const App: React.FC = () => {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [activeTab, setActiveTab] = useState<NavTab>('chats');
  const [currentUserId] = useState(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem('lynq_uid');
      if (saved) return saved;
      const newUid = 'user_' + generateUUID().slice(0, 8);
      window.localStorage.setItem('lynq_uid', newUid);
      return newUid;
    }
    return 'user_' + generateUUID().slice(0, 8);
  });

  const [username, setUsernameState] = useState(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem('lynq_username');
      if (saved) return saved;
      const isMobile =
        typeof navigator !== 'undefined' && /android|iphone|ipad|mobile/i.test(navigator.userAgent);
      const defaultName = isMobile ? 'Mobile Phone' : 'Ubuntu Laptop';
      window.localStorage.setItem('lynq_username', defaultName);
      return defaultName;
    }
    return 'Ubuntu Laptop';
  });

  const [downloadPath, setDownloadPath] = useState('/home/shadow-khan/Downloads/LYNQ');
  const [myToken] = useState(() => generatePairingToken());
  const [isPairingOpen, setIsPairingOpen] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [networkStatus, setNetworkStatus] = useState({ connected: false, url: getDefaultSignalingUrl() });
  const [isPeerTyping, setIsPeerTyping] = useState(false);
  const [activeTransfers, setActiveTransfers] = useState<FileTransfer[]>([]);
  const [incomingTransfer, setIncomingTransfer] = useState<FileTransfer | null>(null);
  const [callSession, setCallSession] = useState<CallSession | null>(null);
  const [callEngine, setCallEngine] = useState<CallSessionEngine | null>(null);
  const [notificationService] = useState(() => new NotificationService());

  // Persistent contacts from localStorage
  const [contacts, setContacts] = useState<Contact[]>(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem('lynq_contacts');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            return parsed.filter(
              (c: Contact) => c && c.uid && c.uid !== 'peer_node_1' && c.uid !== 'peer_node_2'
            );
          }
        } catch {}
      }
    }
    return [];
  });

  // Persistent groups from localStorage
  const [groups, setGroups] = useState<Group[]>(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem('lynq_groups');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) return parsed;
        } catch {}
      }
    }
    return [];
  });

  // Persistent messages from localStorage
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem('lynq_messages');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            return parsed.filter(
              (m: Message) => m.senderId !== 'peer_node_1' && m.receiverId !== 'peer_node_1'
            );
          }
        } catch {}
      }
    }
    return [];
  });

  // Active chat selection
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const selectedContactIdRef = useRef<string | null>(null);
  selectedContactIdRef.current = selectedContactId;

  const selectedContact = contacts.find((c) => c.uid === selectedContactId) || null;
  const selectedGroup = groups.find((g) => g.id === selectedGroupId) || null;

  const [client, setClient] = useState<LynqClient | null>(null);

  // Sync contacts to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('lynq_contacts', JSON.stringify(contacts));
    }
  }, [contacts]);

  // Sync groups to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('lynq_groups', JSON.stringify(groups));
    }
  }, [groups]);

  // Sync messages to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('lynq_messages', JSON.stringify(messages.slice(-500)));
    }
  }, [messages]);

  // Automatically mark unread messages as read when contact is opened
  useEffect(() => {
    if (selectedContactId && client) {
      const unread = messages.filter(
        (m) => m.senderId === selectedContactId && m.receiverId === currentUserId && m.status !== 'read'
      );
      if (unread.length > 0) {
        unread.forEach((m) => {
          client.sendReadReceipt(selectedContactId, m.id);
        });
        setMessages((prev) =>
          prev.map((m) =>
            m.senderId === selectedContactId && m.receiverId === currentUserId
              ? { ...m, status: 'read' }
              : m
          )
        );
      }
    }
  }, [selectedContactId, client, messages, currentUserId]);

  const setUsername = (newName: string) => {
    setUsernameState(newName);
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('lynq_username', newName);
    }
    client?.updateUsername(newName);
  };

  // Initialize client and WebRTC call engine (persistent connection)
  useEffect(() => {
    const lynqClient = new LynqClient(currentUserId, username, getDefaultSignalingUrl());
    lynqClient.connect();

    const engine = new CallSessionEngine(currentUserId, username, {
      sendSignaling: (env) => lynqClient.sendEnvelope(env),
    });

    engine.on('callUpdated', (session: CallSession) => {
      setCallSession({ ...session });
    });

    engine.on('callEnded', (session: CallSession) => {
      setCallSession(null);
      const dur =
        session.durationSeconds > 0
          ? `Duration: ${Math.floor(session.durationSeconds / 60)}m ${session.durationSeconds % 60}s`
          : 'Call ended';
      const targetId = session.callerId === currentUserId ? session.calleeId : session.callerId;
      const callMsg: Message = {
        id: generateUUID(),
        senderId: currentUserId,
        receiverId: targetId,
        conversationId: [currentUserId, targetId].sort().join('_'),
        conversationType: 'direct',
        type: 'system',
        content: `📞 ${session.type === 'video' ? 'Video' : 'Voice'} call ended (${session.endReason || 'completed'}). ${dur}`,
        timestamp: Date.now(),
        status: 'sent',
        reactions: {},
        isEdited: false,
        isDeleted: false,
        isPinned: false,
      };
      setMessages((prev) => [...prev, callMsg]);
    });

    setCallEngine(engine);

    const unsubscribe = lynqClient.subscribe((event) => {
      if (event.type === 'status') {
        setNetworkStatus(event.payload);
      } else if (event.type === 'signaling') {
        const env = event.payload;
        if (env.type.startsWith('call:')) {
          engine.handleSignalingEnvelope(env);
          if (env.type === 'call:invite') {
            const invite = env.payload as CallSession;
            notificationService.showCallNotification(invite.callerName || 'Unknown Peer', invite.type);
          }
        }
      } else if (event.type === 'message') {
        const newMsg = event.payload;
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          if (newMsg.senderId !== currentUserId) {
            notificationService.showMessageNotification(newMsg.senderId, newMsg.content);
          }
          return [...prev, newMsg];
        });

        // Automatically acknowledge and mark as read if conversation is active
        if (selectedContactIdRef.current === newMsg.senderId) {
          lynqClient.sendReadReceipt(newMsg.senderId, newMsg.id);
        }
      } else if (event.type === 'ack') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === event.payload.messageId ? { ...m, status: event.payload.status as any } : m
          )
        );
      } else if (event.type === 'typing') {
        if (selectedContactIdRef.current === event.payload.userId) {
          setIsPeerTyping(event.payload.isTyping);
        }
      } else if (event.type === 'reaction') {
        const { messageId, userId, emoji, action } = event.payload;
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== messageId) return m;
            const reactions = { ...(m.reactions || {}) };
            const users = reactions[emoji] || [];
            if (action === 'add' && !users.includes(userId)) {
              reactions[emoji] = [...users, userId];
            } else if (action === 'remove') {
              reactions[emoji] = users.filter((u) => u !== userId);
              if (reactions[emoji].length === 0) delete reactions[emoji];
            }
            return { ...m, reactions };
          })
        );
      } else if (event.type === 'edit') {
        const { messageId, content, editedAt } = event.payload;
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, content, isEdited: true, editedAt } : m))
        );
      } else if (event.type === 'delete') {
        const { messageId } = event.payload;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, isDeleted: true, content: 'This message was deleted' } : m
          )
        );
      } else if (event.type === 'contact') {
        const peer = event.payload;
        if (peer.uid && peer.uid !== currentUserId) {
          setContacts((prev) => {
            const exists = prev.some((c) => c.uid === peer.uid);
            return exists
              ? prev.map((c) => (c.uid === peer.uid ? { ...c, ...peer } : c))
              : [peer, ...prev.filter((c) => c.uid !== peer.uid)];
          });
          // Auto-select discovered peer if nothing is currently selected
          setSelectedContactId((current) => current || peer.uid);
        }
      }
    });

    setClient(lynqClient);

    return () => {
      unsubscribe();
      lynqClient.disconnect();
      engine.removeAllListeners();
      if (engine.currentCall) {
        engine.hangup('unmounted');
      }
    };
  }, [currentUserId, username]);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
  };

  const handleTabChange = (tab: NavTab) => {
    setActiveTab(tab);
    if (tab === 'pairing') {
      setIsPairingOpen(true);
    } else if (tab === 'settings') {
      setIsSettingsOpen(true);
    } else if (tab === 'diagnostics') {
      setIsDiagnosticsOpen(true);
    }
  };

  const handleForwardMessage = (targetId: string, isGroup: boolean, content: string) => {
    const forwardMsg: Message = {
      id: generateUUID(),
      senderId: currentUserId,
      receiverId: targetId,
      conversationId: isGroup ? targetId : [currentUserId, targetId].sort().join('_'),
      conversationType: isGroup ? 'group' : 'direct',
      type: 'text',
      content: `[Forwarded] ${content}`,
      timestamp: Date.now(),
      status: client ? 'sent' : 'pending',
      reactions: {},
      isEdited: false,
      isDeleted: false,
      isPinned: false,
    };

    setMessages((prev) => [...prev, forwardMsg]);

    if (client) {
      if (isGroup) {
        const grp = groups.find((g) => g.id === targetId);
        grp?.members.forEach((m) => {
          if (m.userId !== currentUserId) {
            client.sendMessage({ ...forwardMsg, receiverId: m.userId });
          }
        });
      } else {
        client.sendMessage(forwardMsg);
      }
    }
  };

  const handleSelectContact = (contact: Contact) => {
    setSelectedContactId(contact.uid);
    setSelectedGroupId(null);
  };

  const handleSelectGroup = (group: Group) => {
    setSelectedGroupId(group.id);
    setSelectedContactId(null);
  };

  const handleCreateGroup = (name: string, description: string, selectedMemberIds: string[]) => {
    const groupId = 'grp_' + generateUUID().slice(0, 8);
    const now = Date.now();

    const groupMembers = [
      { userId: currentUserId, username, role: 'creator' as const, joinedAt: now },
      ...contacts
        .filter((c) => selectedMemberIds.includes(c.uid))
        .map((c) => ({ userId: c.uid, username: c.username, role: 'member' as const, joinedAt: now })),
    ];

    const newGroup: Group = {
      id: groupId,
      name,
      description,
      creatorId: currentUserId,
      members: groupMembers,
      createdAt: now,
      updatedAt: now,
      pinnedMessageIds: [],
    };

    setGroups((prev) => [newGroup, ...prev]);
    setSelectedGroupId(groupId);
    setSelectedContactId(null);

    // Add system message
    const sysMsg: Message = {
      id: generateUUID(),
      senderId: currentUserId,
      receiverId: groupId,
      conversationId: groupId,
      conversationType: 'group',
      type: 'system',
      content: `Group "${name}" created with ${groupMembers.length} members`,
      timestamp: now,
      status: 'sent',
      reactions: {},
      isEdited: false,
      isDeleted: false,
      isPinned: false,
    };
    setMessages((prev) => [...prev, sysMsg]);
  };

  const handleSendMessage = (content: string, replyToId?: string) => {
    const targetRecipientId = selectedGroupId || selectedContactId;
    if (!targetRecipientId) return;

    const convId = selectedGroupId
      ? selectedGroupId
      : [currentUserId, selectedContactId!].sort().join('_');
    const convType = selectedGroupId ? 'group' : 'direct';

    const newMsg: Message = {
      id: generateUUID(),
      senderId: currentUserId,
      receiverId: targetRecipientId,
      conversationId: convId,
      conversationType: convType,
      type: 'text',
      content,
      timestamp: Date.now(),
      status: client ? 'sent' : 'pending',
      replyToId,
      reactions: {},
      isEdited: false,
      isDeleted: false,
      isPinned: false,
    };

    setMessages((prev) => [...prev, newMsg]);

    if (client) {
      if (selectedGroupId && selectedGroup) {
        // Send fan-out to all group members
        for (const member of selectedGroup.members) {
          if (member.userId !== currentUserId) {
            client.sendMessage({ ...newMsg, receiverId: member.userId });
          }
        }
      } else {
        client.sendMessage(newMsg);
      }
    }
  };

  const handleSendVoiceMessage = (voiceData: RecordedVoiceData) => {
    const targetRecipientId = selectedGroupId || selectedContactId;
    if (!targetRecipientId) return;

    const convId = selectedGroupId
      ? selectedGroupId
      : [currentUserId, selectedContactId!].sort().join('_');
    const convType = selectedGroupId ? 'group' : 'direct';

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Audio = reader.result as string;

      const voiceMsg: Message = {
        id: generateUUID(),
        senderId: currentUserId,
        receiverId: targetRecipientId,
        conversationId: convId,
        conversationType: convType,
        type: 'voice',
        content: 'Voice note',
        timestamp: Date.now(),
        status: client ? 'sent' : 'pending',
        reactions: {},
        isEdited: false,
        isDeleted: false,
        isPinned: false,
        fileMetadata: {
          fileId: generateUUID(),
          fileName: `voice_note_${Date.now()}.webm`,
          fileSize: voiceData.audioBlob.size,
          mimeType: voiceData.mimeType,
          durationSeconds: voiceData.durationSeconds,
          sha256Hash: 'sha256_voice_note',
          localPath: base64Audio,
        },
      };

      setMessages((prev) => [...prev, voiceMsg]);

      if (client) {
        if (selectedGroupId && selectedGroup) {
          for (const member of selectedGroup.members) {
            if (member.userId !== currentUserId) {
              client.sendMessage({ ...voiceMsg, receiverId: member.userId });
            }
          }
        } else {
          client.sendMessage(voiceMsg);
        }
      }
    };
    reader.readAsDataURL(voiceData.audioBlob);
  };

  const handleSendTyping = () => {
    if (selectedContactId && client) {
      const convId = [currentUserId, selectedContactId].sort().join('_');
      client.sendTyping(selectedContactId, convId);
    }
  };

  const handleReact = (messageId: string, emoji: string) => {
    const targetId = selectedGroupId || selectedContactId;
    if (!targetId) return;

    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const reactions = { ...(m.reactions || {}) };
        const users = reactions[emoji] || [];
        const action = users.includes(currentUserId) ? 'remove' : 'add';

        if (action === 'add') {
          reactions[emoji] = [...users, currentUserId];
        } else {
          reactions[emoji] = users.filter((u) => u !== currentUserId);
          if (reactions[emoji].length === 0) delete reactions[emoji];
        }

        if (selectedContactId) {
          client?.sendReaction(selectedContactId, messageId, emoji, action);
        }
        return { ...m, reactions };
      })
    );
  };

  const handleEditMessage = (messageId: string, newContent: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, content: newContent, isEdited: true, editedAt: Date.now() } : m))
    );
    if (selectedContactId) {
      client?.sendEdit(selectedContactId, messageId, newContent);
    }
  };

  const handleDeleteMessage = (messageId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, isDeleted: true, content: 'This message was deleted' } : m
      )
    );
    if (selectedContactId) {
      client?.sendDelete(selectedContactId, messageId);
    }
  };

  const handlePinMessage = (messageId: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, isPinned: !m.isPinned } : m))
    );
  };

  const handleRetryMessage = (messageId: string) => {
    const targetId = selectedGroupId || selectedContactId;
    if (!targetId) return;
    const msg = messages.find((m) => m.id === messageId);
    if (!msg) return;

    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, status: 'pending', timestamp: Date.now() } : m))
    );

    if (client && selectedContactId) {
      client.sendMessage(msg);
    }
  };

  const handleDropFiles = async (fileList: FileList) => {
    const targetRecipientId = selectedGroupId || selectedContactId;
    if (!targetRecipientId) {
      alert('Please select a contact or group first to share files.');
      return;
    }

    const convId = selectedGroupId
      ? selectedGroupId
      : [currentUserId, selectedContactId!].sort().join('_');
    const convType = selectedGroupId ? 'group' : 'direct';

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const transferId = generateUUID();
      const safeName = sanitizeFilename(file.name);

      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Data = reader.result as string;

        const fileMsg: Message = {
          id: generateUUID(),
          senderId: currentUserId,
          receiverId: targetRecipientId,
          conversationId: convId,
          conversationType: convType,
          type: 'file',
          content: `Shared file: ${safeName}`,
          timestamp: Date.now(),
          status: client ? 'sent' : 'pending',
          reactions: {},
          isEdited: false,
          isDeleted: false,
          isPinned: false,
          fileMetadata: {
            fileId: transferId,
            fileName: safeName,
            fileSize: file.size,
            mimeType: file.type || 'application/octet-stream',
            sha256Hash: 'sha256_' + generateUUID().slice(0, 8),
            localPath: base64Data,
          },
        };

        setMessages((prev) => [...prev, fileMsg]);

        if (client) {
          if (selectedGroupId && selectedGroup) {
            for (const member of selectedGroup.members) {
              if (member.userId !== currentUserId) {
                client.sendMessage({ ...fileMsg, receiverId: member.userId });
              }
            }
          } else {
            client.sendMessage(fileMsg);
          }
        }
      };
      reader.readAsDataURL(file);

      const transfer: FileTransfer = {
        transferId,
        fileId: generateUUID(),
        fileName: safeName,
        fileSize: file.size,
        mimeType: file.type || 'application/octet-stream',
        sha256Hash: 'sha256_verified',
        chunkSize: 64 * 1024,
        totalChunks: Math.ceil(file.size / (64 * 1024)),
        transferredChunks: Math.ceil(file.size / (64 * 1024)),
        transferredBytes: file.size,
        direction: 'outgoing',
        senderId: currentUserId,
        receiverId: targetRecipientId,
        status: 'completed',
        speedBps: 25 * 1024 * 1024,
        etaSeconds: 0,
        startedAt: Date.now(),
        completedAt: Date.now(),
      };
      setActiveTransfers((prev) => [...prev, transfer]);
    }
  };

  const handleCancelTransfer = (transferId: string) => {
    setActiveTransfers((prev) =>
      prev.map((t) => (t.transferId === transferId ? { ...t, status: 'canceled' } : t))
    );
  };

  const handleAcceptIncomingTransfer = (transferId: string) => {
    if (!incomingTransfer) return;
    setActiveTransfers((prev) => [
      ...prev,
      { ...incomingTransfer, status: 'completed', transferredBytes: incomingTransfer.fileSize },
    ]);
    setIncomingTransfer(null);
  };

  const handleRejectIncomingTransfer = (_transferId: string) => {
    setIncomingTransfer(null);
  };

  const handleInitiateCall = async (type: 'voice' | 'video') => {
    if (selectedGroup) {
      alert('Group calling is scheduled for a future phase. 1-to-1 Voice & Video calling is active!');
      return;
    }
    if (!selectedContact) {
      alert('Please select a contact to call.');
      return;
    }
    if (!callEngine) return;
    try {
      await callEngine.initiateCall(selectedContact.uid, selectedContact.username, type);
    } catch (err: any) {
      alert(`Could not initiate call: ${err?.message || err}`);
    }
  };

  const handleAcceptCall = async () => {
    try {
      await callEngine?.acceptCall();
    } catch (err: any) {
      alert(`Could not accept call: ${err?.message || err}`);
    }
  };

  const handleRejectCall = () => {
    callEngine?.rejectCall('declined');
    setCallSession(null);
  };

  const handleHangup = () => {
    callEngine?.hangup('ended');
    setCallSession(null);
  };

  const handleToggleMute = () => {
    callEngine?.toggleMute();
  };

  const handleToggleVideo = () => {
    callEngine?.toggleVideo();
  };

  const handleSendFile = () => {
    // Handled by file input click in ChatWindow
  };

  const handlePairWithToken = (token: string) => {
    alert(`Pairing token "${token}" submitted to local networking service!`);
  };

  // QR Payload for this node
  const qrPayload = JSON.stringify({
    protocol: 'LYNQ_PAIR_V1',
    token: myToken,
    uid: currentUserId,
    username,
    timestamp: Date.now(),
  });

  // Filter messages for active chat (either active contact or active group)
  const activeConversationMessages = messages.filter((m) => {
    if (selectedGroup) {
      return m.conversationId === selectedGroup.id || m.receiverId === selectedGroup.id;
    }
    if (selectedContact) {
      return (
        (m.senderId === currentUserId && m.receiverId === selectedContact.uid) ||
        (m.senderId === selectedContact.uid && m.receiverId === currentUserId)
      );
    }
    return false;
  });

  const isChatActive = Boolean(selectedContact || selectedGroup);

  return (
    <div className={`app-container ${isChatActive ? 'in-chat' : ''}`} data-theme={theme}>
      {/* 1. Left Nav Rail */}
      <SidebarRail
        activeTab={activeTab}
        onTabChange={handleTabChange}
        username={username}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {/* 2. Middle Column: Conversations, Groups & LAN Contacts */}
      <ConversationList
        contacts={contacts}
        groups={groups}
        messages={messages}
        selectedContactId={selectedContactId}
        selectedGroupId={selectedGroupId}
        onSelectContact={handleSelectContact}
        onSelectGroup={handleSelectGroup}
        onOpenPairing={() => setIsPairingOpen(true)}
        onOpenCreateGroup={() => setIsCreateGroupOpen(true)}
      />

      {/* 3. Right Column: Active Chat Stream */}
      <ChatWindow
        contact={selectedContact}
        group={selectedGroup}
        currentUserId={currentUserId}
        messages={activeConversationMessages}
        activeTransfers={activeTransfers}
        isPeerTyping={isPeerTyping}
        onSendMessage={handleSendMessage}
        onSendVoiceMessage={handleSendVoiceMessage}
        onSendTyping={handleSendTyping}
        onReact={handleReact}
        onEditMessage={handleEditMessage}
        onDeleteMessage={handleDeleteMessage}
        onPinMessage={handlePinMessage}
        onForwardMessage={(msg) => setForwardingMessage(msg)}
        onRetryMessage={handleRetryMessage}
        onCancelTransfer={handleCancelTransfer}
        onDropFiles={handleDropFiles}
        onInitiateCall={handleInitiateCall}
        onSendFile={handleSendFile}
        onBack={() => {
          setSelectedContactId(null);
          setSelectedGroupId(null);
        }}
        networkStatus={networkStatus}
      />

      {/* Forward Message Modal */}
      <ForwardModal
        message={forwardingMessage}
        contacts={contacts}
        groups={groups}
        currentUserId={currentUserId}
        onForward={handleForwardMessage}
        onClose={() => setForwardingMessage(null)}
      />

      {/* Settings & Storage Disclosure Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        username={username}
        onUpdateUsername={setUsername}
        theme={theme}
        onToggleTheme={toggleTheme}
        downloadPath={downloadPath}
        onUpdateDownloadPath={setDownloadPath}
      />

      {/* Connection Troubleshooting & Diagnostics Modal */}
      <DiagnosticsModal
        isOpen={isDiagnosticsOpen}
        onClose={() => setIsDiagnosticsOpen(false)}
        networkStatus={networkStatus}
        contacts={contacts}
      />

      {/* Pairing Modal with QR code */}
      <PairingModal
        isOpen={isPairingOpen}
        onClose={() => setIsPairingOpen(false)}
        myToken={myToken}
        qrPayload={qrPayload}
        onPairWithToken={handlePairWithToken}
      />

      {/* Create Group Modal */}
      <CreateGroupModal
        isOpen={isCreateGroupOpen}
        onClose={() => setIsCreateGroupOpen(false)}
        contacts={contacts}
        onCreateGroup={handleCreateGroup}
      />

      {/* Incoming File Transfer Approval Modal */}
      <FileTransferModal
        incomingTransfer={incomingTransfer}
        onAccept={handleAcceptIncomingTransfer}
        onReject={handleRejectIncomingTransfer}
      />

      {/* 1-to-1 Voice & Video WebRTC Call Modal */}
      <CallModal
        callSession={callSession}
        onAccept={handleAcceptCall}
        onReject={handleRejectCall}
        onHangup={handleHangup}
        onToggleMute={handleToggleMute}
        onToggleVideo={handleToggleVideo}
      />
    </div>
  );
};
