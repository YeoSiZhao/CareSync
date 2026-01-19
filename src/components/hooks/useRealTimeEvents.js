import { useState, useEffect, useRef } from 'react';

const API_BASE = 'http://localhost:8080';

const useRealtimeEvents = () => {
  const [events, setEvents] = useState([]);
  const [localUpdates, setLocalUpdates] = useState({}); // {id: {note: string}}
  const localUpdatesRef = useRef(localUpdates);

  useEffect(() => {
    localUpdatesRef.current = localUpdates;
  }, [localUpdates]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEvents((prev) =>
      prev.map((item) => {
        const local = localUpdates[item.id] || {};
        return {
          ...item,
          note: local.note || null,
        };
      })
    );
  }, [localUpdates]);

  useEffect(() => {
    let eventSource;
    let isMounted = true;

    const applyLocal = (items) =>
      items.map((item) => {
        const local = localUpdatesRef.current[item.id] || {};
        return {
          ...item,
          note: local.note || null,
        };
      });

    const fetchInitial = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/events`);
        const data = await response.json();
        if (!isMounted) return;
        const mapped = data.map((event) => ({
          id: event.id,
          type: event.label,
          timestamp: new Date(event.timestamp),
        }));
        mapped.sort((a, b) => b.timestamp - a.timestamp);
        setEvents(applyLocal(mapped));
      } catch (error) {
        console.error('Error fetching events:', error);
      }
    };

    fetchInitial();

    eventSource = new EventSource(`${API_BASE}/api/events/stream`);
    eventSource.onmessage = (event) => {
      if (!event.data) return;
      const payload = JSON.parse(event.data);
      const incoming = {
        id: payload.id,
        type: payload.label,
        timestamp: new Date(payload.timestamp),
      };
      setEvents((prev) => {
        if (prev.some((item) => item.id === incoming.id)) {
          return prev;
        }
        const next = [incoming, ...prev];
        return applyLocal(next);
      });
    };

    eventSource.onerror = (err) => {
      console.error('Event stream error:', err);
    };

    return () => {
      isMounted = false;
      if (eventSource) {
        eventSource.close();
      }
    };
  }, []);

  const updateLocal = (id, updates) => {
    setLocalUpdates(prev => ({
      ...prev,
      [id]: { ...prev[id], ...updates }
    }));
  };

  return { events, setEvents: updateLocal };
};

export default useRealtimeEvents;
