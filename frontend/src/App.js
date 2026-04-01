import React, { useState } from 'react';
import axios from 'axios';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line
} from 'recharts';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

function App() {
  const [files, setFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [activeTab, setActiveTab] = useState('upload');

  const handleFileChange = (e) => {
    setFiles([...e.target.files]);
  };

  const handleUpload = async () => {
    setProcessing(true);
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    
    try {
      const response = await axios.post(`${API_URL}/api/invoices/batch`, formData);
      setResults(response.data.results);
      fetchAnalytics();
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Upload failed: ' + error.message);
    } finally {
      setProcessing(false);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/analytics`);
      setAnalytics(response.data);
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f3f4f6' }}>
      <header style={{ backgroundColor: 'white', boxShadow: '0 1px 3px 0 rgba(0,0,0,0.1)', padding: '1.5rem' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', color: '#111827' }}>
            Invoice Intelligence Platform
          </h1>
        </div>
      </header>

      <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '1.5rem' }}>
        <div style={{ borderBottom: '1px solid #e5e7eb', marginBottom: '1.5rem' }}>
          <nav style={{ display: 'flex', gap: '2rem' }}>
            {['upload', 'results', 'analytics'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '0.5rem 0',
                  borderBottom: activeTab === tab ? '2px solid #3b82f6' : '2px solid transparent',
                  fontWeight: '500',
                  fontSize: '0.875rem',
                  color: activeTab === tab ? '#2563eb' : '#6b7280',
                  cursor: 'pointer',
                  background: 'none'
                }}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </nav>
        </div>

        {activeTab === 'upload' && (
          <div style={{ backgroundColor: 'white', borderRadius: '0.5rem', boxShadow: '0 1px 3px 0 rgba(0,0,0,0.1)', padding: '1.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>Upload Invoices</h2>
            <input
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.pdf"
              onChange={handleFileChange}
              style={{ marginBottom: '1rem', display: 'block', width: '100%' }}
            />
            <button
              onClick={handleUpload}
              disabled={processing || files.length === 0}
              style={{
                backgroundColor: '#3b82f6',
                color: 'white',
                padding: '0.5rem 1.5rem',
                borderRadius: '0.5rem',
                border: 'none',
                cursor: processing || files.length === 0 ? 'not-allowed' : 'pointer'
              }}
            >
              {processing ? 'Processing...' : `Upload ${files.length} File(s)`}
            </button>
            
            {results.length > 0 && (
              <div style={{ marginTop: '1.5rem' }}>
                <h3 style={{ fontWeight: '600', marginBottom: '0.5rem' }}>Recent Uploads</h3>
                {results.map((r, i) => (
                  <div key={i} style={{ padding: '0.75rem', marginBottom: '0.5rem', borderRadius: '0.25rem', backgroundColor: r.success ? '#f0fdf4' : '#fef2f2' }}>
                    <strong>{r.file}:</strong> {r.success ? '✓ Processed' : `✗ ${r.error}`}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'analytics' && analytics && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
              <div style={{ backgroundColor: 'white', borderRadius: '0.5rem', padding: '1.5rem', boxShadow: '0 1px 3px 0 rgba(0,0,0,0.1)' }}>
                <h3 style={{ color: '#6b7280', fontSize: '0.875rem' }}>Total Invoices</h3>
                <p style={{ fontSize: '1.875rem', fontWeight: 'bold' }}>{analytics.total_invoices}</p>
              </div>
              <div style={{ backgroundColor: 'white', borderRadius: '0.5rem', padding: '1.5rem', boxShadow: '0 1px 3px 0 rgba(0,0,0,0.1)' }}>
                <h3 style={{ color: '#6b7280', fontSize: '0.875rem' }}>Total Spend</h3>
                <p style={{ fontSize: '1.875rem', fontWeight: 'bold' }}>${analytics.total_spend.toLocaleString()}</p>
              </div>
              <div style={{ backgroundColor: 'white', borderRadius: '0.5rem', padding: '1.5rem', boxShadow: '0 1px 3px 0 rgba(0,0,0,0.1)' }}>
                <h3 style={{ color: '#6b7280', fontSize: '0.875rem' }}>Unique Vendors</h3>
                <p style={{ fontSize: '1.875rem', fontWeight: 'bold' }}>{Object.keys(analytics.vendor_totals).length}</p>
              </div>
            </div>

            <div style={{ backgroundColor: 'white', borderRadius: '0.5rem', padding: '1.5rem', marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem' }}>Spend by Vendor</h3>
              <BarChart
                width={700}
                height={300}
                data={Object.entries(analytics.vendor_totals).map(([name, value]) => ({ name, value }))}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#8884d8" />
              </BarChart>
            </div>

            <div style={{ backgroundColor: 'white', borderRadius: '0.5rem', padding: '1.5rem' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem' }}>Monthly Spend Trend</h3>
              <LineChart
                width={700}
                height={300}
                data={Object.entries(analytics.monthly_trend).map(([month, amount]) => ({ month, amount }))}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="amount" stroke="#82ca9d" />
              </LineChart>
            </div>
          </div>
        )}

        {activeTab === 'results' && results.length > 0 && (
          <div style={{ backgroundColor: 'white', borderRadius: '0.5rem', padding: '1.5rem' }}>
            <h3 style={{ fontWeight: '600', marginBottom: '1rem' }}>Extracted Data</h3>
            {results.filter(r => r.success).map((r, i) => (
              <div key={i} style={{ borderBottom: '1px solid #e5e7eb', padding: '1rem 0' }}>
                <h4 style={{ fontWeight: '600' }}>{r.file}</h4>
                <pre style={{ backgroundColor: '#f3f4f6', padding: '0.5rem', borderRadius: '0.25rem', overflow: 'auto' }}>
                  {JSON.stringify(r.data.extracted_data, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;