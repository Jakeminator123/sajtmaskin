# components/Sidebar.tsx

Reason: Useful structural reference

```text
import FooterItem from "./FooterItem";
import MenuItem from "./MenuItem";
import SocialItem from "./SocialItem";

export default function Sidebar(props: { pageId: string; }) {

  const menuItems = [
    {
      menuItemId: "Start",
      menuItemText: "Start",
      menuItemActive: false,
      menuItemLink: '/'
    },
    {
      menuItemId: "Authentication",
      menuItemText: "Authentication",
      menuItemActive: false,
      menuItemLink: '/authentication'
    },
    {
      menuItemId: "PubSubChannels",
      menuItemText: "Pub/Sub Channels",
      menuItemActive: false,
      menuItemLink: '/pub-sub'
    },
    {
      menuItemId: "Presence",
      menuItemText: "Presence",
      menuItemActive: false,
      menuItemLink: '/presence'
    },
    {
      menuItemId: "History",
      menuItemText: "History",
      menuItemActive: false,
      menuItemLink: '/history'
    }
  ]

  const footerItems = [
    {
      menuItemText: "View our Docs",
      menuItemLink: 'https://ably.com/docs/'
    },
    {
      menuItemText: "Explore Pub/Sub Channels",
      menuItemLink: 'https://ably.com/channels'
    },
    {
      menuItemText: "ably.com",
      menuItemLink: 'https://ably.com/'
    },
  ];

  const socialItems = [
    {
      menuItemText: "X (Twitter)",
      menuItemLink: 'https://twitter.com/ablyrealtime/',
      menuItemIcon: <path fillRule="evenodd" clipRule="evenodd" d="M17.7286 2H20.9857L13.8699 10.1329L22.2411 21.2H15.6865L10.5527 14.4879L4.67852 21.2H1.41945L9.03052 12.501L1 2H7.72098L12.3615 8.13514L17.7286 2ZM16.5855 19.2505H18.3903L6.74031 3.84714H4.80357L16.5855 19.2505Z"/>,
      menuItemFillSyles: 'fill-black'
    },
    {
      menuItemText: "Github",
      menuItemLink: 'https://github.com/ably/',
      menuItemIcon: <path fillRule="evenodd" clipRule="evenodd" d="M12 0C5.4 0 0 5.41945 0 12.0432C0 17.3623 3.4 21.8785 8.2 23.4843C8.8 23.5846 9 23.1832 9 22.8821C9 22.581 9 21.8785 9 20.8749C5.7 21.5774 5 19.2692 5 19.2692C4.5 17.8641 3.7 17.4627 3.7 17.4627C2.6 16.7601 3.8 16.7602 3.8 16.7602C5 16.8605 5.6 17.9645 5.6 17.9645C6.7 19.771 8.4 19.2692 9.1 18.9681C9.2 18.1652 9.5 17.6634 9.9 17.3623C7.1 17.0612 4.3 16.0576 4.3 11.4411C4.3 10.1364 4.8 9.03242 5.5 8.22953C5.5 7.82809 5 6.62377 5.7 5.01801C5.7 5.01801 6.7 4.71693 9 6.22233C10 5.92125 11 5.82089 12 5.82089C1

// ... truncated
```
