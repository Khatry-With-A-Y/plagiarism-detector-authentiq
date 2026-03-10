import { useState, useEffect, useCallback } from 'react';
import { submissionsAPI } from '../api/results';

export default function useFetchResults(submissionId) {
  const [results, setResults] = useState([]);
  const [submission, setSubmission] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetch = useCallback(async () => {
    if (!submissionId) return;
    setLoading(true);
    setError('');

    try {
      const response = await submissionsAPI.getResults(submissionId);
      setSubmission(response.data);
      setResults(response.data.results || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load results');
    } finally {
      setLoading(false);
    }
  }, [submissionId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { results, submission, loading, error, refresh: fetch };
}
