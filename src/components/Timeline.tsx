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
  compressed?: boolean;
  gapThresholdDays?: number;
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
};

// Main event types to show in filters (order matters for display)
export const MAIN_EVENT_TYPES: EventType[] = ['RECOVERED', 'REGRINDED', 'PICTURE', 'LINKED', 'UNLINKED', 'ENGRAVED'];

// Groups for timeline rows (order matters)
export const TIMELINE_GROUPS = [
  { id: 'RECOVERED', types: ['RECOVERED'] },
  { id: 'REGRINDED', types: ['REGRINDED'] },
  { id: 'PICTURE', types: ['PICTURE'] },
  { id: 'ENGRAVED', types: ['ENGRAVED'] },
  { id: 'POSITION', types: ['LINKED', 'UNLINKED'], label: 'Linked', icon: '🔗', color: '#0891b2', bgColor: '#cffafe' },
];

const DAY_MS = 1000 * 60 * 60 * 24;
const STANDARD_GAP_MS = DAY_MS * 14; // Standard gap between events in compressed view

interface CompressedEvent {
  event: AssetEvent;
  originalDate: Date;
  displayDate: Date;
  displayIndex: number;
}

interface GapMarker {
  id: string;
  displayDate: Date;
  originalDays: number;
  beforeIndex: number;
}

// Calculate compressed timeline - use evenly spaced positioning with gap markers
function compressTimeline(
  events: AssetEvent[],
  thresholdDays: number
): { compressedEvents: CompressedEvent[]; gaps: GapMarker[] } {
  const visibleEvents = events
    .filter(e => e.state === 'VISIBLE')
    .map(e => ({
      event: e,
      originalDate: new Date(e.creationDateTime),
      displayDate: new Date(e.creationDateTime),
      displayIndex: 0,
    }))
    .sort((a, b) => a.originalDate.getTime() - b.originalDate.getTime());

  if (visibleEvents.length === 0) {
    return { compressedEvents: [], gaps: [] };
  }

  const gaps: GapMarker[] = [];

  // Use a reference start date for positioning
  const baseDate = new Date(2020, 0, 1); // Fixed reference point
  let currentPosition = 0; // Position index

  // First event at base position
  visibleEvents[0].displayDate = new Date(baseDate.getTime());
  visibleEvents[0].displayIndex = currentPosition;

  for (let i = 1; i < visibleEvents.length; i++) {
    const prev = visibleEvents[i - 1];
    const curr = visibleEvents[i];
    const gapMs = curr.originalDate.getTime() - prev.originalDate.getTime();
    const gapDays = gapMs / DAY_MS;

    currentPosition++;

    if (gapDays > thresholdDays) {
      // Large gap - add gap marker
      gaps.push({
        id: `gap-${i}`,
        displayDate: new Date(baseDate.getTime() + currentPosition * STANDARD_GAP_MS - STANDARD_GAP_MS / 2),
        originalDays: Math.round(gapDays),
        beforeIndex: i,
      });
    }

    // Position event at regular interval
    curr.displayDate = new Date(baseDate.getTime() + currentPosition * STANDARD_GAP_MS);
    curr.displayIndex = currentPosition;
  }

  return { compressedEvents: visibleEvents, gaps };
}

// Get Countroll web app URL for an event
function getEventUrl(assetId: string, eventId: string): string {
  return `https://app.countroll.com/#/thing/${assetId}/events/${eventId}`;
}

// Find pictures for an event
function getPicturesForEvent(eventId: string, pictures?: PictureEvent[]): PictureEvent | undefined {
  if (!pictures) return undefined;
  return pictures.find(p => p.url.includes(eventId));
}

// Format tooltip content
function formatTooltip(
  event: AssetEvent,
  assetId: string,
  pictures?: PictureEvent[],
  isCompressed?: boolean,
  originalDate?: Date
): string {
  const displayDate = new Date(event.creationDateTime);
  const date = displayDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

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
      ${isCompressed ? '<span style="margin-left: 4px; font-size: 10px; color: #9ca3af;">(compressed view)</span>' : ''}
    </div>
  `);

  // Title
  if (event.title) {
    lines.push(`<div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">${event.title}</div>`);
  }

  // Date (show original date in compressed mode)
  lines.push(`<div style="color: #6b7280; font-size: 12px; margin-bottom: 8px;">${date}</div>`);

  // Description
  if (event.description) {
    lines.push(`<div style="margin-bottom: 8px;">${event.description}</div>`);
  }

  // Details grid
  const details: string[] = [];
  if (event.reference) {
    details.push(`<div><span style="color: #6b7280;">Work Order:</span> ${event.reference}</div>`);
  }
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

  // Click hint
  lines.push(`<div style="margin-top: 8px; font-size: 11px; color: #9ca3af;">Click to open in Countroll</div>`);

  return lines.join('');
}

// Create groups for timeline rows
function createGroups(eventTypes: Set<string>) {
  return TIMELINE_GROUPS
    .filter(group => group.types.some(t => eventTypes.has(t)))
    .map(group => {
      // Use custom label/icon/color if defined, otherwise use first type's config
      const config = group.label
        ? { label: group.label, icon: group.icon, color: group.color, bgColor: group.bgColor }
        : EVENT_TYPE_CONFIG[group.types[0] as EventType];
      return {
        id: group.id,
        content: `<span style="display: flex; align-items: center; gap: 6px;">
          <span style="font-size: 14px;">${config.icon}</span>
          <span style="font-size: 12px; font-weight: 500; color: ${config.color};">${config.label}</span>
        </span>`,
        style: `background-color: ${config.bgColor}; border-left: 3px solid ${config.color};`,
      };
    });
}

// Get the group ID for an event type
function getGroupForType(type: EventType): string {
  const group = TIMELINE_GROUPS.find(g => g.types.includes(type));
  return group ? group.id : type;
}

// Convert API events to vis-timeline items (normal mode)
function eventsToTimelineItems(
  events: AssetEvent[],
  assetId: string,
  pictures?: PictureEvent[]
) {
  return events
    .filter(event => event.state === 'VISIBLE')
    .map(event => {
      const config = EVENT_TYPE_CONFIG[event.type];
      return {
        id: event.id,
        group: getGroupForType(event.type),
        content: `<span class="event-icon-only">${config.icon}</span>`,
        start: new Date(event.creationDateTime),
        type: 'point' as const,
        className: `event-${event.type.toLowerCase()} event-clickable`,
        title: formatTooltip(event, assetId, pictures),
      };
    });
}

// Format date for compressed view label
function formatCompressedLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

// Convert compressed events to vis-timeline items
function compressedEventsToTimelineItems(
  compressedEvents: CompressedEvent[],
  gaps: GapMarker[],
  assetId: string,
  pictures?: PictureEvent[]
) {
  const eventItems = compressedEvents.map(({ event, displayDate, originalDate }) => {
    const config = EVENT_TYPE_CONFIG[event.type];
    return {
      id: event.id,
      group: getGroupForType(event.type),
      content: `<div class="compressed-event-label">
        <span class="event-date">${formatCompressedLabel(originalDate)}</span>
        <span class="event-icon-only">${config.icon}</span>
      </div>`,
      start: displayDate,
      type: 'point' as const,
      className: `event-${event.type.toLowerCase()} event-clickable`,
      title: formatTooltip(event, assetId, pictures, true, originalDate),
    };
  });

  // Gap markers don't have a group - they span all
  const gapItems = gaps.map(gap => ({
    id: gap.id,
    content: `${gap.originalDays}d`,
    start: gap.displayDate,
    type: 'background' as const,
    className: 'gap-marker',
    title: `<div style="text-align: center; padding: 8px;">
      <div style="font-weight: 600; color: #6b7280;">Gap Compressed</div>
      <div style="font-size: 12px; color: #9ca3af; margin-top: 4px;">
        ${gap.originalDays} days between events
      </div>
    </div>`,
  }));

  return [...eventItems, ...gapItems];
}

export function Timeline({
  events,
  pictures,
  assetId,
  compressed = false,
  gapThresholdDays = 90,
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
    const groups = new DataSet(createGroups(eventTypes));

    // Create dataset based on mode
    let items;
    if (compressed) {
      const { compressedEvents, gaps } = compressTimeline(events, gapThresholdDays);
      items = new DataSet(compressedEventsToTimelineItems(compressedEvents, gaps, assetId, pictures));
    } else {
      items = new DataSet(eventsToTimelineItems(events, assetId, pictures));
    }

    // Calculate end date with generous padding to ensure labels fit
    const today = new Date();
    const lastEventDate = visibleEvents.length > 0
      ? new Date(Math.max(...visibleEvents.map(e => new Date(e.creationDateTime).getTime())))
      : today;
    // Use 180 days (6 months) padding to ensure rightmost labels are fully visible
    const endDate = new Date(Math.max(today.getTime(), lastEventDate.getTime()) + 180 * DAY_MS);

    // Calculate height based on number of groups (not event types, since some are combined)
    const activeGroups = TIMELINE_GROUPS.filter(g => g.types.some(t => eventTypes.has(t)));
    const groupCount = activeGroups.length;
    const rowHeight = 50;
    const headerHeight = 40;
    const calculatedHeight = Math.max(200, groupCount * rowHeight + headerHeight);

    // Calculate initial window
    let initialStart: Date;
    let initialEnd: Date;

    if (selectedYears && selectedYears.size > 0 && !compressed) {
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

    // Timeline options - set initial window via start/end to avoid fit() issues
    const options = {
      height: `${calculatedHeight}px`,
      start: initialStart,
      end: initialEnd,
      min: compressed ? undefined : new Date(2015, 0, 1),
      max: compressed ? undefined : new Date(2030, 0, 1), // Far future to not limit view
      zoomMin: compressed ? 1000 * 60 * 60 * 24 : 1000 * 60 * 60 * 24 * 7,
      zoomMax: compressed ? 1000 * 60 * 60 * 24 * 365 * 2 : 1000 * 60 * 60 * 24 * 365 * 10,
      orientation: 'top',
      showCurrentTime: !compressed,
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
      // Hide time axis in compressed mode since dates are not real
      showMajorLabels: !compressed,
      showMinorLabels: !compressed,
      // Group settings
      groupOrder: 'content',
      stack: false,
    };

    // Create the timeline with groups
    const timeline = new VisTimeline(containerRef.current, items, groups, options);
    timelineRef.current = timeline;

    // Handle click events
    timeline.on('select', (properties: { items: string[] }) => {
      if (properties.items.length > 0) {
        const eventId = properties.items[0];

        // Ignore gap marker clicks
        if (eventId.startsWith('gap-')) {
          timeline.setSelection([]);
          return;
        }

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
  }, [events, pictures, assetId, compressed, gapThresholdDays, selectedYears, onEventClick]);

  return (
    <div className="timeline-container">
      <div ref={containerRef} className="w-full" />
    </div>
  );
}
