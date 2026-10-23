import React, { useState, useEffect } from 'react';
import { Contact, Message, generateUUID, generatePairingToken } from '@lynq/core';
import { LynqClient } from './services/LynqClient';
import { SidebarRail, NavTab } from './components/SidebarRail';
import { ConversationList } from './components/ConversationList';
import { ChatWindow } from './components/ChatWindow';
import { PairingModal } from './components/PairingModal';
import './styles/theme.css';

export const App: React.FC = () => {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [activeTab, setActiveTab] = useState<NavTab>('chats');
  const [currentUserId] = useState(() => 'user_' + generateUUID().slice(0, 8));
  const [username] = useState('LocalHost');
  const [myToken] = useState(() => generatePairingToken());
  const [isPairingOpen, setIsPairingOpen] = useState(false);
  const [networkStatus, setNetworkStatus] = useState({ connected: false, url: 'ws://127.0.0.1:4848' });

  // Initial contacts with default local network peer placeholder
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

  const [selectedContact, setSelectedContact] = useState<Contact | null>(contacts[0]);

  // Initial messages
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'msg_welcome_1',
      senderId: 'peer_node_1',
      receiverId: currentUserId,
      conversationId: 'conv_1',
      conversationType: 'direct',
      type: 'text',
      content: 'Welcome to LYNQ Communication! Ultra-fast local LAN messaging is ready.',
      timestamp: Date.now() - 60000,
      status: 'read',
      reactions: {},
      isEdited: false,
      isDeleted: false,
      isPinned: false,
    },
  ]);

  const [client, setClient] = useState<LynqClient | null>(null);

  // Initialize client
  useEffect(() => {
    const lynqClient = new LynqClient(currentUserId);
    lynqClient.connect();

    const unsubscribe = lynqClient.subscribe((event) => {
      if (event.type === 'status') {
        setNetworkStatus(event.payload);
      } else if (event.type === 'message') {
        setMessages((prev) => [...prev, event.payload]);
      } else if (event.type === 'ack') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === event.payload.messageId ? { ...m, status: event.payload.status as any } : m
          )
        );
      } else if (event.type === 'contact') {
        setContacts((prev) => {
          const exists = prev.some((c) => c.uid === event.payload.uid);
          return exists ? prev.map((c) => (c.uid === event.payload.uid ? event.payload : c)) : [...prev, event.payload];
        });
      }
    });

    setClient(lynqClient);

    return () => {
      unsubscribe();
      lynqClient.disconnect();
    };
  }, [currentUserId]);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
  };

  const handleSendMessage = (content: string) => {
    if (!selectedContact) return;

    if (client) {
      const msg = client.sendMessage(selectedContact.uid, content);
      setMessages((prev) => [...prev, msg]);
    } else {
      const fallbackMsg: Message = {
        id: generateUUID(),
        senderId: currentUserId,
        receiverId: selectedContact.uid,
        conversationId: [currentUserId, selectedContact.uid].sort().join('_'),
        conversationType: 'direct',
        type: 'text',
        content,
        timestamp: Date.now(),
        status: 'sent',
        reactions: {},
        isEdited: false,
        isDeleted: false,
        isPinned: false,
      };
      setMessages((prev) => [...prev, fallbackMsg]);
    }
  };

  const handleInitiateCall = (type: 'voice' | 'video') => {
    if (!selectedContact) return;
    alert(`Initiating ${type} call with ${selectedContact.username} over WebRTC (Phase 8 feature)`);
  };

  const handleSendFile = () => {
    if (!selectedContact) return;
    alert(`Selecting file for direct P2P transfer with ${selectedContact.username} (Phase 5 feature)`);
  };

  const handlePairWithToken = (token: string) => {
    alert(`Pairing token "${token}" submitted to local networking service!`);
  };

  // Filter messages for active chat
  const activeConversationMessages = messages.filter((m) => {
    if (!selectedContact) return false;
    return (
      (m.senderId === currentUserId && m.receiverId === selectedContact.uid) ||
      (m.senderId === selectedContact.uid && m.receiverId === currentUserId)
    );
  });

  return (
    <div className="app-container" data-theme={theme}>
      {/* 1. Left Nav Rail */}
      <SidebarRail
        activeTab={activeTab}
        onTabChange={setActiveTab}
        username={username}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {/* 2. Middle Column: Conversations & LAN Contacts */}
      <ConversationList
        contacts={contacts}
        messages={messages}
        selectedContactId={selectedContact?.uid || null}
        onSelectContact={(c) => setSelectedContact(c)}
        onOpenPairing={() => setIsPairingOpen(true)}
      />

      {/* 3. Right Column: Active Chat Stream */}
      <ChatWindow
        contact={selectedContact}
        currentUserId={currentUserId}
        messages={activeConversationMessages}
        onSendMessage={handleSendMessage}
        onInitiateCall={handleInitiateCall}
        onSendFile={handleSendFile}
        networkStatus={networkStatus}
      />

      {/* Pairing Modal */}
      <PairingModal
        isOpen={isPairingOpen}
        onClose={() => setIsPairingOpen(false)}
        myToken={myToken}
        onPairWithToken={handlePairWithToken}
      />
    </div>
  );
};
