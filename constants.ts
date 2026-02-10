import { Article, Section, User, UserRole } from './types';

export const MOCK_USERS: User[] = [
  {
    id: 'u1',
    name: 'Alice Admin',
    email: 'alice.admin@la.gov',
    role: UserRole.ADMIN,
    avatar: 'https://picsum.photos/seed/alice/50/50',
  },
  {
    id: 'u2',
    name: 'Eddie Editor',
    email: 'eddie.editor@la.gov',
    role: UserRole.EDITOR,
    avatar: 'https://picsum.photos/seed/eddie/50/50',
  },
  {
    id: 'u3',
    name: 'John User',
    email: 'john.user@la.gov',
    role: UserRole.USER,
    avatar: 'https://picsum.photos/seed/john/50/50',
  },
  {
    id: 'u4',
    name: 'Guest Visitor',
    email: 'guest.visitor@la.gov',
    role: UserRole.GUEST,
    avatar: 'https://picsum.photos/seed/guest/50/50',
  },
];

export const SECTIONS: Section[] = [
  {
    id: 'euc',
    title: 'EUC',
    subsections: [
      { id: 'incident-management', title: 'Incident Management' },
      { id: 'field-operations', title: 'Field Operations' },
      { id: 'system-admin', title: 'System Admin' },
      { id: 'asset-management', title: 'Asset Management' },
    ],
  },
  {
    id: 'hr',
    title: 'Human Resources',
    subsections: [
      { id: 'benefits', title: 'Benefits' },
      { id: 'careers', title: 'Careers' },
    ],
  },
  {
    id: 'general',
    title: 'General News',
  },
];

export const INITIAL_ARTICLES: Article[] = [
  {
    id: 'a1',
    title: 'ServiceNow Implementation Update',
    excerpt: 'Key updates regarding the new ServiceNow module for Incident Management.',
    content: `
      <h2>ServiceNow Migration Successful</h2>
      <p>We are pleased to announce that the migration to the new ServiceNow instance for <strong>Incident Management</strong> has been completed successfully.</p>
      <p>All users in the EUC department should now use the new portal for logging tickets.</p>
      <h3>Key Changes:</h3>
      <ul>
        <li>New simplified UI for ticket creation.</li>
        <li>Automated routing to Level 2 support.</li>
        <li>Improved SLA tracking dashboard.</li>
      </ul>
      <p>Please refer to the training documentation for more details.</p>
    `,
    sectionId: 'euc',
    subsectionId: 'incident-management',
    authorId: 'u1',
    authorName: 'Alice Admin',
    timestamp: Date.now() - 10000000,
    imageUrl: 'https://picsum.photos/seed/snow/800/400',
    allowComments: true,
    comments: [
      {
        id: 'c1',
        authorId: 'u3',
        authorName: 'John User',
        authorAvatar: 'https://picsum.photos/seed/john/50/50',
        content: 'This is great news! The new UI looks much cleaner.',
        timestamp: Date.now() - 5000000,
      }
    ],
    status: 'published',
    tags: ['servicenow', 'migration'],
    attachments: [],
  },
  {
    id: 'a2',
    title: 'Annual Company Picnic',
    excerpt: 'Join us for food, fun, and games at the city park next Friday!',
    content: `
      <p>It's that time of year again! The annual company picnic is fast approaching.</p>
      <p><strong>When:</strong> Friday, July 24th<br><strong>Where:</strong> Central City Park</p>
      <p>Bring your families and enjoy a day of BBQ and team building activities.</p>
    `,
    sectionId: 'general',
    authorId: 'u2',
    authorName: 'Eddie Editor',
    timestamp: Date.now() - 20000000,
    imageUrl: 'https://picsum.photos/seed/picnic/800/400',
    allowComments: true,
    comments: [],
    status: 'published',
    tags: ['event', 'team-building'],
    attachments: [],
  },
  {
    id: 'a3',
    title: 'New Health Benefit Options',
    excerpt: 'Open enrollment begins next week. Review the new plans available.',
    content: `<p>We have added two new provider options for dental and vision.</p>`,
    sectionId: 'hr',
    subsectionId: 'benefits',
    authorId: 'u1',
    authorName: 'Alice Admin',
    timestamp: Date.now() - 86400000,
    allowComments: false,
    comments: [],
    status: 'published',
    tags: ['benefits', 'hr'],
    attachments: [],
  },
  {
    id: 'a4',
    title: 'SWE Migration Project Kickoff',
    excerpt: 'The Software Engineering migration to the new VDI environment starts this month.',
    content: `
      <h2>SWE Migration Details</h2>
      <p>The Field Operations team is preparing to migrate the Software Engineering (SWE) department to the new high-performance VDI environment.</p>
      <p><strong>Timeline:</strong></p>
      <ul>
        <li>Pilot Group: June 15th</li>
        <li>Wave 1: June 22nd</li>
        <li>Wave 2: June 29th</li>
      </ul>
      <p>Please ensure all data is backed up to OneDrive prior to your scheduled migration slot.</p>
    `,
    sectionId: 'euc',
    subsectionId: 'field-operations',
    authorId: 'u1',
    authorName: 'Alice Admin',
    timestamp: Date.now() - 500000,
    imageUrl: 'https://picsum.photos/seed/tech/800/400',
    allowComments: true,
    comments: [],
    status: 'published',
    tags: ['migration', 'vdi'],
    attachments: [],
  }
];