import React from 'react';
import { Link } from 'react-router-dom';

function Landing() {
  return (
    <div className="container" style={{ textAlign: 'center', marginTop: '100px' }}>
      <h1>Welcome to Authentiq</h1>
      <p>Your plagiarism detection companion for academic papers.</p>
      <div style={{ marginTop: '30px' }}>
        <Link to="/login" className="btn btn-primary" style={{ marginRight: '10px' }}>
          Login
        </Link>
        <Link to="/register" className="btn btn-secondary">
          Register
        </Link>
      </div>
    </div>
  );
}

export default Landing;
