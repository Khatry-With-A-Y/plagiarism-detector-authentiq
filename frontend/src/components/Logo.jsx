import React from 'react';
import { Link } from 'react-router-dom';
import './Logo.css';

const Logo = ({ to, className = "", style = {} }) => {
  const content = (
    <>
      <img src="/logo.png" alt="Authentiq Logo" className="logo-icon" />
      <span className="logo-text">Authentiq</span>
    </>
  );

  const fullClassName = `authentiq-logo ${className}`.trim();

  if (to) {
    return (
      <Link to={to} className={fullClassName} style={style}>
        {content}
      </Link>
    );
  }

  return (
    <div className={fullClassName} style={style}>
      {content}
    </div>
  );
};

export default Logo;
