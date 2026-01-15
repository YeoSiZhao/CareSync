import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../backend/firebase';

const useRealtimeEvents = () => {
  const [events, setEvents] = useState([]);
  const [acknowledgedIds, setAcknowledgedIds] = useState(new Set());

  useEffect(() => {
    const eventsRef = collection(db, 'events');

    // Live Firestore subscription
    const unsubscribe = onSnapshot(eventsRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        type: doc.data().label,
        timestamp: doc.data().timestamp?.toDate
          ? doc.data().timestamp.toDate()
          : new Date(doc.data().timestamp),
        acknowledged: acknowledgedIds.has(doc.id),
        note: null
      }));

      // Sort newest first
      data.sort((a, b) => b.timestamp - a.timestamp);
      setEvents(data);
    });

    return () => unsubscribe();
  }, [acknowledgedIds]);

  const setEventsWithAck = (updater) => {
    setEvents(prev => {
      const newEvents = typeof updater === 'function' ? updater(prev) : updater;
      const newAckIds = new Set(acknowledgedIds);

      newEvents.forEach(event => {
        if (event.acknowledged) newAckIds.add(event.id);
        else newAckIds.delete(event.id);
      });

      setAcknowledgedIds(newAckIds);
      return newEvents;
    });
  };

  return { events, setEvents: setEventsWithAck };
};

export default useRealtimeEvents;
