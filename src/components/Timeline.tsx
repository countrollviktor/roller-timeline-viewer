import { useEffect, useRef } from 'react';
import { Timeline as VisTimeline } from 'vis-timeline/standalone';
import { DataSet } from 'vis-data/standalone';
import type { AssetEvent, EventType, PictureEvent } from '../types';

// Import vis-timeline CSS
import 'vis-timeline/styles/vis-timeline-graph2d.css';

interface TimelineProps {
  events: AssetEvent[];
  pictures?: PictureEvent[];
  assetId: string;
  selectedYears?: Set<number>;
  onEventClick?: (event: AssetEvent) => void;
}

// Event type display configuration
export const EVENT_TYPE_CONFIG: Record<EventType, { label: string; icon: string; color: string; bgColor: string; group?: string }> = {
  RECOVERED: { label: 'Recovered', icon: '▲', color: '#16a34a', bgColor: '#dcfce7' },
  REGRINDED: { label: 'Regrinded', icon: '▼', color: '#dc2626', bgColor: '#fee2e2' },
  PICTURE: { label: 'Picture', icon: '📷', color: '#9333ea', bgColor: '#f3e8ff' },
  ENGRAVED: { label: 'Engraved', icon: '✒', color: '#ea580c', bgColor: '#ffedd5' },
  INITIALIZED: { label: 'Initialized', icon: '•', color: '#6b7280', bgColor: '#f3f4f6' },
  UNINITIALIZED: { label: 'Uninitialized', icon: '•', color: '#6b7280', bgColor: '#f3f4f6' },
  LINKED: { label: 'Linked', icon: '🔗', color: '#0891b2', bgColor: '#cffafe', group: 'POSITION' },
  UNLINKED: { label: 'Unlinked', icon: '🔗', color: '#64748b', bgColor: '#e2e8f0', group: 'POSITION' },
  ROLLER_LINKED_TO_WO: { label: 'Linked to WO', icon: '•', color: '#6b7280', bgColor: '#f3f4f6' },
  OTHER: { label: 'Other', icon: '★', color: '#0f766e', bgColor: '#ccfbf1' },
};

// Main event types to show in filters (order matters for display)
export const MAIN_EVENT_TYPES: EventType[] = ['RECOVERED', 'REGRINDED', 'PICTURE', 'OTHER', 'LINKED', 'UNLINKED', 'ENGRAVED'];

// Static groups for timeline rows (order matters)
// RECOVERED is handled dynamically — split by coverMaterial
export const TIMELINE_GROUPS = [
  { id: 'REGRINDED', types: ['REGRINDED'] },
  { id: 'PICTURE', types: ['PICTURE'] },
  { id: 'ENGRAVED', types: ['ENGRAVED'] },
  { id: 'POSITION', types: ['LINKED', 'UNLINKED'], label: 'Linked', icon: '🔗', color: '#0891b2', bgColor: '#cffafe' },
  { id: 'OTHER', types: ['OTHER'] },
];

// Get Countroll web app URL for an event
function getEventUrl(assetId: string, eventId: string): string {
  return `https://app.countroll.com/#/thing/${assetId}/events/${eventId}`;
}

// Find pictures for an event
function getPicturesForEvent(eventId: string, pictures?: PictureEvent[]): PictureEvent | undefined {
  if (!pictures) return undefined;
  return pictures.find(p => p.url.includes(eventId));
}

// Format date as "25 Aug 2025" or "25 Aug 2025, 14:30"
function formatDate(date: Date, includeTime: boolean): string {
  const day = date.getDate();
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  const year = date.getFullYear();

  if (includeTime) {
    const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${day} ${month} ${year}, ${time}`;
  }
  return `${day} ${month} ${year}`;
}

// Format tooltip content
function formatTooltip(
  event: AssetEvent,
  assetId: string,
  pictures?: PictureEvent[]
): string {
  const displayDate = new Date(event.creationDateTime);

  // For REGRINDED and RECOVERED, show date only; for others include time
  const showTimeTypes = ['PICTURE', 'LINKED', 'UNLINKED', 'ENGRAVED', 'INITIALIZED', 'UNINITIALIZED'];
  const date = formatDate(displayDate, showTimeTypes.includes(event.type));

  const config = EVENT_TYPE_CONFIG[event.type];
  const lines: string[] = [];

  // Header with colored badge
  lines.push(`
    <div style="margin-bottom: 8px;">
      <span style="
        display: inline-block;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
        background-color: ${config.bgColor};
        color: ${config.color};
        border: 1px solid ${config.color};
      ">${config.label}</span>
    </div>
  `);

  // Title
  if (event.title) {
    lines.push(`<div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">${event.title}</div>`);
  }

  // Date
  lines.push(`<div style="color: #6b7280; font-size: 12px; margin-bottom: 8px;">${date}</div>`);

  // Description - make it prominent for PICTURE events (contains the comment)
  if (event.description) {
    if (event.type === 'PICTURE' || event.type === 'OTHER') {
      lines.push(`<mark>${event.description}</mark>`);
    } else {
      lines.push(`<div>${event.description}</div>`);
    }
  }

  // Details grid
  const details: string[] = [];
  if (event.diameter) {
    details.push(`<div><span style="color: #6b7280;">Diameter:</span> ${event.diameter} mm</div>`);
  }
  if (event.who && event.who !== 'service-account-datam-service-client') {
    details.push(`<div><span style="color: #6b7280;">By:</span> ${event.who}</div>`);
  }
  if (event.coverMaterial) {
    details.push(`<div><span style="color: #6b7280;">Material:</span> ${event.coverMaterial}</div>`);
  }
  if (event.coverHardness) {
    details.push(`<div><span style="color: #6b7280;">Hardness:</span> ${event.coverHardness}</div>`);
  }

  if (details.length > 0) {
    lines.push(`<div style="font-size: 12px; line-height: 1.6;">${details.join('')}</div>`);
  }

  // Pictures for PICTURE events
  if (event.type === 'PICTURE') {
    const pictureData = getPicturesForEvent(event.id, pictures);
    if (pictureData && pictureData.pictures.length > 0) {
      lines.push(`<div style="margin-top: 8px; display: flex; gap: 4px; flex-wrap: wrap;">`);
      pictureData.pictures.slice(0, 3).forEach(pic => {
        lines.push(`
          <img
            src="${pic.downloadUrl}"
            alt="${pic.fileName}"
            style="width: 60px; height: 60px; object-fit: cover; border-radius: 4px; border: 1px solid #e5e7eb;"
          />
        `);
      });
      if (pictureData.pictures.length > 3) {
        lines.push(`<div style="display: flex; align-items: center; padding: 0 8px; color: #6b7280; font-size: 12px;">+${pictureData.pictures.length - 3} more</div>`);
      }
      lines.push(`</div>`);
    }
  }

  return lines.join('');
}

// Get unique materials from RECOVERED events
function getRecoveredMaterials(events: AssetEvent[]): string[] {
  const materials = new Set<string>();
  for (const e of events) {
    if (e.type === 'RECOVERED' && e.state === 'VISIBLE') {
      materials.add(e.coverMaterial || 'Unknown');
    }
  }
  return Array.from(materials).sort();
}

// Get the group ID for a RECOVERED event based on its material
function getRecoveredGroupId(material?: string): string {
  return `RECOVERED:${material || 'Unknown'}`;
}

// Build a group label with icon and text
function groupLabel(icon: string, text: string, color: string): string {
  return `<span style="color:${color}">${icon}</span> ${text}`;
}

// Create groups for timeline rows
function createGroups(eventTypes: Set<string>, events: AssetEvent[]) {
  const groups: { id: string; content: string; style: string; order: number }[] = [];
  let order = 0;

  // Dynamic RECOVERED groups by material
  if (eventTypes.has('RECOVERED')) {
    const config = EVENT_TYPE_CONFIG.RECOVERED;
    const materials = getRecoveredMaterials(events);
    for (const material of materials) {
      groups.push({
        id: getRecoveredGroupId(material),
        content: groupLabel(config.icon, material, config.color),
        style: `border-left: 3px solid ${config.color};`,
        order: order++,
      });
    }
  }

  // Static groups (order follows TIMELINE_GROUPS array)
  for (const group of TIMELINE_GROUPS) {
    if (!group.types.some(t => eventTypes.has(t))) continue;
    const config = group.label
      ? { label: group.label, icon: group.icon, color: group.color }
      : EVENT_TYPE_CONFIG[group.types[0] as EventType];
    groups.push({
      id: group.id,
      content: groupLabel(config.icon!, config.label!, config.color!),
      style: `border-left: 3px solid ${config.color};`,
      order: order++,
    });
  }

  return groups;
}

// Get the group ID for an event
function getGroupForEvent(event: AssetEvent): string {
  if (event.type === 'RECOVERED') {
    return getRecoveredGroupId(event.coverMaterial);
  }
  const group = TIMELINE_GROUPS.find(g => g.types.includes(event.type));
  return group ? group.id : event.type;
}

// Convert API events to vis-timeline items
function eventsToTimelineItems(
  events: AssetEvent[],
  assetId: string,
  pictures?: PictureEvent[]
) {
  return events
    .filter(event => event.state === 'VISIBLE' && EVENT_TYPE_CONFIG[event.type])
    .map(event => {
      const config = EVENT_TYPE_CONFIG[event.type];
      return {
        id: event.id,
        group: getGroupForEvent(event),
        content: `<span class="event-icon-only">${config.icon}</span>`,
        start: new Date(event.creationDateTime),
        type: 'box' as const,
        className: `event-${event.type.toLowerCase()} event-clickable`,
        title: formatTooltip(event, assetId, pictures),
      };
    });
}

export function Timeline({
  events,
  pictures,
  assetId,
  selectedYears,
  onEventClick,
}: TimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<VisTimeline | null>(null);
  const eventsMapRef = useRef<Map<string, AssetEvent>>(new Map());

  useEffect(() => {
    if (!containerRef.current) return;

    // Build events map for click handling
    const eventsMap = new Map<string, AssetEvent>();
    events.forEach(e => eventsMap.set(e.id, e));
    eventsMapRef.current = eventsMap;

    // Get unique event types for groups
    const visibleEvents = events.filter(e => e.state === 'VISIBLE');
    const eventTypes = new Set(visibleEvents.map(e => e.type));
    const groupData = createGroups(eventTypes, visibleEvents);
    const groups = new DataSet(groupData);

    // Create dataset
    const items = new DataSet(eventsToTimelineItems(events, assetId, pictures));

    // Calculate height based on number of groups
    const groupCount = groupData.length;
    const rowHeight = 50;
    const headerHeight = 40;
    const calculatedHeight = Math.max(200, groupCount * rowHeight + headerHeight);

    // Calculate initial window
    let initialStart: Date;
    let initialEnd: Date;

    if (selectedYears && selectedYears.size > 0) {
      // Show selected years: Jan 1 to Dec 31
      const yearsArray = Array.from(selectedYears).sort((a, b) => a - b);
      const minYear = yearsArray[0];
      const maxYear = yearsArray[yearsArray.length - 1];

      initialStart = new Date(minYear, 0, 1); // Jan 1
      initialEnd = new Date(maxYear, 11, 31); // Dec 31
    } else if (visibleEvents.length > 0) {
      // Fit to event range: first event year Jan 1 to last event year Dec 31
      const eventDates = visibleEvents.map(e => new Date(e.creationDateTime));
      const minYear = Math.min(...eventDates.map(d => d.getFullYear()));
      const maxYear = Math.max(...eventDates.map(d => d.getFullYear()));

      initialStart = new Date(minYear, 0, 1); // Jan 1 of first event year
      initialEnd = new Date(maxYear, 11, 31); // Dec 31 of last event year
    } else {
      // No events - show current year
      const now = new Date();
      initialStart = new Date(now.getFullYear(), 0, 1);
      initialEnd = new Date(now.getFullYear(), 11, 31);
    }

    // Timeline options
    const options = {
      height: `${calculatedHeight}px`,
      start: initialStart,
      end: initialEnd,
      min: new Date(2015, 0, 1),
      max: new Date(2030, 0, 1),
      zoomMin: 1000 * 60 * 60 * 24 * 7, // 1 week
      zoomMax: 1000 * 60 * 60 * 24 * 365 * 10, // 10 years
      orientation: 'top',
      showCurrentTime: true,
      zoomable: true,
      moveable: true,
      selectable: true,
      margin: {
        item: 5,
        axis: 5,
      },
      tooltip: {
        followMouse: false,
        overflowMethod: 'cap',
      },
      align: 'center',
      groupOrder: 'order',
      stack: false,
    };

    // Create the timeline with groups
    const timeline = new VisTimeline(containerRef.current, items, groups, options);
    timelineRef.current = timeline;

    // Handle click events
    timeline.on('select', (properties: { items: string[] }) => {
      if (properties.items.length > 0) {
        const eventId = properties.items[0];
        const event = eventsMapRef.current.get(eventId);

        if (event) {
          if (onEventClick) {
            onEventClick(event);
          } else {
            const url = getEventUrl(assetId, eventId);
            window.open(url, '_blank', 'noopener,noreferrer');
          }
        }

        timeline.setSelection([]);
      }
    });

    // Cleanup on unmount
    return () => {
      timeline.destroy();
      timelineRef.current = null;
    };
  }, [events, pictures, assetId, selectedYears, onEventClick]);

  return (
    <div className="timeline-container">
      <div ref={containerRef} className="w-full" />
    </div>
  );
}
