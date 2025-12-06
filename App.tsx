
import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider } from './services/auth';
import { Layout } from './components/Layout';
import { AdminLayout } from './components/AdminLayout';
import { Home } from './pages/Home';
import { Properties } from './pages/Properties';
import { PropertyDetails } from './pages/PropertyDetails';
import { Agents } from './pages/Agents';
import { AgentDetails } from './pages/AgentDetails';
import { Blog } from './pages/Blog';
import { BlogDetails } from './pages/BlogDetails';
import { About } from './pages/About';
import { Contact } from './pages/Contact';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Dashboard } from './pages/admin/Dashboard';
import { PropertiesAdmin } from './pages/admin/PropertiesAdmin';
import { AgentsAdmin } from './pages/admin/AgentsAdmin';
import { LeadsAdmin } from './pages/admin/LeadsAdmin';
import { UsersAdmin } from './pages/admin/UsersAdmin';
import { SettingsAdmin } from './pages/admin/SettingsAdmin';
import { BlogAdmin } from './pages/admin/BlogAdmin';
import { ScrollToTop } from './components/ScrollToTop';

// Global flag to track if the initial redirect has occurred during this page load session.
// This prevents the redirect from interfering with navigation after the app has loaded.
let initialRedirectComplete = false;

const InitialRedirect = () => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!initialRedirectComplete) {
      initialRedirectComplete = true;
      // In BrowserRouter, we typically don't need to force redirect to root on load 
      // unless specifically desired. Removing the forced navigation allows deep linking 
      // (e.g. refreshing /about stays on /about).
    }
  }, [navigate]);

  return null;
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <Router>
        <ScrollToTop />
        <InitialRedirect />
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="properties" element={<Properties />} />
            <Route path="properties/:slug" element={<PropertyDetails />} />
            <Route path="agents" element={<Agents />} />
            <Route path="agents/:id" element={<AgentDetails />} />
            <Route path="blog" element={<Blog />} />
            <Route path="blog/:slug" element={<BlogDetails />} />
            <Route path="about" element={<About />} />
            <Route path="contact" element={<Contact />} />
          </Route>

          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Admin Routes */}
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="properties" element={<PropertiesAdmin />} />
            <Route path="agents" element={<AgentsAdmin />} />
            <Route path="leads" element={<LeadsAdmin />} />
            <Route path="blog" element={<BlogAdmin />} />
            <Route path="users" element={<UsersAdmin />} />
            <Route path="settings" element={<SettingsAdmin />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
};

export default App;
