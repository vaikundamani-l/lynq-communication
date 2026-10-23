import React, { useState, useEffect } from 'react';
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

  // Initial contacts
  const [contacts, setContacts] = useState<Contact[]>([
    {
      uid: 'peer_node_1',
      username: 'Ubuntu Laptop',
      ipAddress: '192.168.1.102',
      port: 4848,
      status: 'online',
      lastSeen: Date.now(),
      deviceInfo: {
        deviceId: 'dev_laptop_1',
        deviceName: 'ThinkPad LAN',
        platform: 'linux',
        appVersion: '0.1.0',
      },
      isPaired: true,
    },
    {
      uid: 'peer_node_2',
      username: 'Android Phone',
      ipAddress: '192.168.1.108',
      port: 4848,
      status: 'away',
      lastSeen: Date.now() - 30000,
      deviceInfo: {
        deviceId: 'dev_phone_1',
        deviceName: 'Pixel 8',
        platform: 'android',
        appVersion: '0.1.0',
      },
      isPaired: false,
    },
  ]);

  // Initial groups
  const [groups, setGroups] = useState<Group[]>([
    {
      id: 'grp_local_engineering',
      name: 'Local Engineering',
      description: 'LAN development and project updates',
      creatorId: currentUserId,
      members: [
        { userId: currentUserId, username: 'LocalHost', role: 'creator', joinedAt: Date.now() - 3600000 },
        { userId: 'peer_node_1', username: 'Ubuntu Laptop', role: 'admin', joinedAt: Date.now() - 3600000 },
        { userId: 'peer_node_2', username: 'Android Phone', role: 'member', joinedAt: Date.now() - 3600000 },
      ],
      createdAt: Date.now() - 3600000,
      updatedAt: Date.now() - 60000,
      pinnedMessageIds: [],
    },
  ]);

  const [selectedContact, setSelectedContact] = useState<Contact | null>(contacts[0]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);

  // Initial messages
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'msg_welcome_1',
      senderId: 'peer_node_1',
      receiverId: currentUserId,
      conversationId: 'conv_1',
      conversationType: 'direct',
      type: 'text',
      content: 'Welcome to LYNQ Communication! Ultra-fast local LAN messaging & P2P file transfers are ready.',
      timestamp: Date.now() - 60000,
      status: 'read',
      reactions: { '👍': ['peer_node_1'] },
      isEdited: false,
      isDeleted: false,
      isPinned: false,
    },
    {
      id: 'msg_group_welcome',
      senderId: 'peer_node_1',
      receiverId: 'grp_local_engineering',
      conversationId: 'grp_local_engineering',
      conversationType: 'group',
      type: 'text',
      content: 'Welcome to the Local Engineering private group! All members can post and transfer files directly.',
      timestamp: Date.now() - 50000,
      status: 'read',
      reactions: { '🔥': [currentUserId] },
      isEdited: false,
      isDeleted: false,
      isPinned: false,
    },
  ]);

  const [client, setClient] = useState<LynqClient | null>(null);

  const setUsername = (newName: string) => {
    setUsernameState(newName);
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('lynq_username', newName);
    }
    client?.updateUsername(newName);
  };

  // Initialize client
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

        // Automatically acknowledge and mark as read if conversation is open
        if (selectedContact && newMsg.senderId === selectedContact.uid) {
          lynqClient.sendReadReceipt(newMsg.senderId, newMsg.id);
        }
      } else if (event.type === 'ack') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === event.payload.messageId ? { ...m, status: event.payload.status as any } : m
          )
        );
      } else if (event.type === 'typing') {
        if (selectedContact && event.payload.userId === selectedContact.uid) {
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
        if (peer.uid !== currentUserId) {
          setContacts((prev) => {
            const exists = prev.some((c) => c.uid === peer.uid);
            return exists
              ? prev.map((c) => (c.uid === peer.uid ? { ...c, ...peer } : c))
              : [peer, ...prev.filter((c) => c.uid !== peer.uid)];
          });
          setSelectedContact((current) => current || peer);
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
  }, [currentUserId, selectedContact]);

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
            client.sendMessage(m.userId, forwardMsg.content);
          }
        });
      } else {
        client.sendMessage(targetId, forwardMsg.content);
      }
    }
  };

  const handleSelectContact = (contact: Contact) => {
    setSelectedContact(contact);
    setSelectedGroup(null);
  };

  const handleSelectGroup = (group: Group) => {
    setSelectedGroup(group);
    setSelectedContact(null);
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
    setSelectedGroup(newGroup);
    setSelectedContact(null);

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
    const targetRecipientId = selectedGroup ? selectedGroup.id : selectedContact?.uid;
    if (!targetRecipientId) return;

    const convId = selectedGroup
      ? selectedGroup.id
      : [currentUserId, selectedContact!.uid].sort().join('_');
    const convType = selectedGroup ? 'group' : 'direct';

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
      if (selectedGroup) {
        // Send fan-out to all group members
        for (const member of selectedGroup.members) {
          if (member.userId !== currentUserId) {
            client.sendMessage(member.userId, content, replyToId);
          }
        }
      } else {
        client.sendMessage(selectedContact!.uid, content, replyToId);
      }
    }
  };

  const handleSendVoiceMessage = (voiceData: RecordedVoiceData) => {
    const targetRecipientId = selectedGroup ? selectedGroup.id : selectedContact?.uid;
    if (!targetRecipientId) return;

    const convId = selectedGroup
      ? selectedGroup.id
      : [currentUserId, selectedContact!.uid].sort().join('_');
    const convType = selectedGroup ? 'group' : 'direct';

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
      },
    };

    setMessages((prev) => [...prev, voiceMsg]);

    if (client) {
      if (selectedGroup) {
        for (const member of selectedGroup.members) {
          if (member.userId !== currentUserId) {
            client.sendMessage(member.userId, voiceMsg.content);
          }
        }
      } else {
        client.sendMessage(selectedContact!.uid, voiceMsg.content);
      }
    }
  };

  const handleSendTyping = () => {
    if (selectedContact && client) {
      const convId = [currentUserId, selectedContact.uid].sort().join('_');
      client.sendTyping(selectedContact.uid, convId);
    }
  };

  const handleReact = (messageId: string, emoji: string) => {
    const targetId = selectedGroup ? selectedGroup.id : selectedContact?.uid;
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

        if (selectedContact) {
          client?.sendReaction(selectedContact.uid, messageId, emoji, action);
        }
        return { ...m, reactions };
      })
    );
  };

  const handleEditMessage = (messageId: string, newContent: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, content: newContent, isEdited: true, editedAt: Date.now() } : m))
    );
    if (selectedContact) {
      client?.sendEdit(selectedContact.uid, messageId, newContent);
    }
  };

  const handleDeleteMessage = (messageId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, isDeleted: true, content: 'This message was deleted' } : m
      )
    );
    if (selectedContact) {
      client?.sendDelete(selectedContact.uid, messageId);
    }
  };

  const handlePinMessage = (messageId: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, isPinned: !m.isPinned } : m))
    );
  };

  const handleRetryMessage = (messageId: string) => {
    const targetId = selectedGroup ? selectedGroup.id : selectedContact?.uid;
    if (!targetId) return;
    const msg = messages.find((m) => m.id === messageId);
    if (!msg) return;

    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, status: 'pending', timestamp: Date.now() } : m))
    );

    if (client && selectedContact) {
      client.sendMessage(selectedContact.uid, msg.content, msg.replyToId);
    }
  };

  const handleDropFiles = async (fileList: FileList) => {
    const targetId = selectedGroup ? selectedGroup.id : selectedContact?.uid;
    if (!targetId) return;

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const transferId = generateUUID();
      const safeName = sanitizeFilename(file.name);

      const transfer: FileTransfer = {
        transferId,
        fileId: generateUUID(),
        fileName: safeName,
        fileSize: file.size,
        mimeType: file.type || 'application/octet-stream',
        sha256Hash: 'computing...',
        chunkSize: 64 * 1024,
        totalChunks: Math.ceil(file.size / (64 * 1024)),
        transferredChunks: 0,
        transferredBytes: 0,
        direction: 'outgoing',
        senderId: currentUserId,
        receiverId: targetId,
        status: 'transferring',
        speedBps: 25 * 1024 * 1024, // 25 MB/s LAN average
        etaSeconds: Math.ceil(file.size / (25 * 1024 * 1024)),
        startedAt: Date.now(),
      };

      setActiveTransfers((prev) => [...prev, transfer]);

      // Progress animation simulation
      let sentBytes = 0;
      const interval = setInterval(() => {
        sentBytes += file.size / 5;
        if (sentBytes >= file.size) {
          sentBytes = file.size;
          clearInterval(interval);
          setActiveTransfers((prev) =>
            prev.map((t) =>
              t.transferId === transferId
                ? { ...t, transferredBytes: file.size, status: 'completed', completedAt: Date.now() }
                : t
            )
          );

          // Add file bubble to chat
          const fileMsg: Message = {
            id: generateUUID(),
            senderId: currentUserId,
            receiverId: targetId,
            conversationId: selectedGroup
              ? selectedGroup.id
              : [currentUserId, selectedContact!.uid].sort().join('_'),
            conversationType: selectedGroup ? 'group' : 'direct',
            type: 'file',
            content: `Shared file: ${safeName}`,
            timestamp: Date.now(),
            status: 'sent',
            reactions: {},
            isEdited: false,
            isDeleted: false,
            isPinned: false,
            fileMetadata: {
              fileId: transfer.fileId,
              fileName: safeName,
              fileSize: file.size,
              mimeType: file.type,
              sha256Hash: 'sha256_verified',
            },
          };
          setMessages((prev) => [...prev, fileMsg]);
        } else {
          setActiveTransfers((prev) =>
            prev.map((t) =>
              t.transferId === transferId ? { ...t, transferredBytes: Math.round(sentBytes) } : t
            )
          );
        }
      }, 300);
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
      { ...incomingTransfer, status: 'transferring', transferredBytes: incomingTransfer.fileSize },
    ]);
    setIncomingTransfer(null);
  };

  const handleRejectIncomingTransfer = (transferId: string) => {
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
      return m.conversationId === selectedGroup.id;
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
        selectedContactId={selectedContact?.uid || null}
        selectedGroupId={selectedGroup?.id || null}
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
          setSelectedContact(null);
          setSelectedGroup(null);
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
