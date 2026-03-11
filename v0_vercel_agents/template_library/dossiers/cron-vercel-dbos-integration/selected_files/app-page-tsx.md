# app/page.tsx

Reason: Useful structural reference

```text
'use client';

import { enqueueWorkflow, listWorkflows } from './actions';
import { useEffect, useState } from 'react';
import { WorkflowStatus } from '@dbos-inc/dbos-sdk';

export default function Home() {
  const [workflows, setWorkflows] = useState<WorkflowStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [enqueueing, setEnqueueing] = useState(false);
  const [startingWorker, setStartingWorker] = useState(false);

  const fetchWorkflows = async () => {
    try {
      const data = await listWorkflows();
      setWorkflows(data);
    } catch (error) {
      console.error('Failed to fetch workflows:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkflows();
    const interval = setInterval(fetchWorkflows, 3000); // Refresh every 3 seconds
    return () => clearInterval(interval);
  }, []);

  const handleEnqueue = async () => {
    setEnqueueing(true);
    try {
      await enqueueWorkflow();
      await fetchWorkflows();
    } catch (error) {
      console.error('Failed to enqueue workflow:', error);
    } finally {
      setEnqueueing(false);
    }
  };

  const handleStartWorker = async () => {
    setStartingWorker(true);
    try {
      const response = await fetch('/api/dbos');
      const data = await response.text();
      console.log('API response:', data);
    } catch (error) {
      console.error('Failed to start worker:', error);
    } finally {
      setStartingWorker(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'success':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'enqueued':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'pending':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'error':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatTimestamp = (epochMs: number) => {
    const date = new Date(epochMs);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-s

// ... truncated
```
