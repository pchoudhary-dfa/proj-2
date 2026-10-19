import React from 'react';

interface SimpleEmailLogsTableProps {
  apiBaseUrl: string;
  onError?: (error: string) => void;
  onSuccess?: (message: string) => void;
  userData?: any;
  getLogs?: () => Promise<any[]>;
}

export const EmailLogsTableSimple: React.FC<SimpleEmailLogsTableProps> = ({
  apiBaseUrl,
  onError,
  onSuccess,
  userData,
  getLogs
}) => {
  return (
    <div style={{ padding: '20px' }}>
      <h2>Email Logs</h2>
      <p>Email logs functionality is being loaded...</p>
      <p>API Base URL: {apiBaseUrl}</p>
      {userData && (
        <p>User: {userData.name}</p>
      )}
    </div>
  );
};
