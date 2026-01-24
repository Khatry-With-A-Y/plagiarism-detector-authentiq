import React, { useState } from 'react';
import { submissionsAPI } from '../services/api';

function FileUpload({ onUploadSuccess }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const allowedTypes = ['.txt', '.pdf', '.doc', '.docx'];
  const maxSize = 10 * 1024 * 1024; // 10MB

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    setError('');
    setSuccess('');

    if (!selectedFile) {
      return;
    }

    // Check file type
    const fileExt = '.' + selectedFile.name.split('.').pop().toLowerCase();
    if (!allowedTypes.includes(fileExt)) {
      setError(`File type not allowed. Allowed types: ${allowedTypes.join(', ')}`);
      setFile(null);
      return;
    }

    // Check file size
    if (selectedFile.size > maxSize) {
      setError(`File size exceeds 10MB limit`);
      setFile(null);
      return;
    }

    setFile(selectedFile);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a file');
      return;
    }

    setUploading(true);
    setError('');
    setSuccess('');

    try {
      const response = await submissionsAPI.upload(file);
      setSuccess('File uploaded successfully! Processing...');
      setFile(null);
      e.target.reset();
      if (onUploadSuccess) {
        onUploadSuccess(response.data.submission);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="card">
      <h3 style={{ marginBottom: '20px' }}>Upload Document for Analysis</h3>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Select File (.txt, .pdf, .doc, .docx - Max 10MB)</label>
          <input
            type="file"
            onChange={handleFileChange}
            accept=".txt,.pdf,.doc,.docx"
            disabled={uploading}
          />
        </div>
        {error && <div className="error">{error}</div>}
        {success && <div className="success">{success}</div>}
        <button
          type="submit"
          className="btn btn-primary"
          disabled={uploading || !file}
        >
          {uploading ? 'Uploading...' : 'Upload & Analyze'}
        </button>
      </form>
    </div>
  );
}

export default FileUpload;
