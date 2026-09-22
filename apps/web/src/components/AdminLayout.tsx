import { useState, useEffect } from 'react';
import { Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import api from '../lib/api';
import { Menu, X, LayoutDashboard, Package, Archive, ShoppingCart, Users, FileText, BarChart2, AlertTriangle } from 'lucide-react';
import '../styles/AdminLayout.css';

const AdminLayout = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const user = JSON.parse(localStorage.getItem('dms_user') || '{}');

  const handleLogout = () => {
    localStorage.removeItem('dms_token');
    localStorage.removeItem('dms_user');
    navigate('/');
  };

  const [pendingOrders, setPendingOrders] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [pendingClaims, setPendingClaims] = useState(0);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const response = await api.get('/api/dashboard/metrics');
        setPendingOrders(response.data.pendingOrders || 0);
        setLowStockCount(response.data.lowStockCount || 0);
        setPendingClaims(response.data.pendingClaims || 0);
      } catch (err) {
        console.error('Failed to fetch pending orders for badge');
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, []);

  const navItems = [
    { name: 'Dashboard', path: '/admin/dashboard', icon: <LayoutDashboard size={20} /> },
    { name: 'Products', path: '/admin/products', icon: <Package size={20} /> },
    { name: 'Inventory', path: '/admin/inventory', icon: <Archive size={20} /> },
    { name: 'Orders', path: '/admin/orders', icon: <ShoppingCart size={20} /> },
    { name: 'Distributors', path: '/admin/distributors', icon: <Users size={20} /> },
    { name: 'Claims & Credits', path: '/admin/claims', icon: <AlertTriangle size={20} /> },
    { name: 'Ledger & Billing', path: '/admin/ledger', icon: <FileText size={20} /> },
    { name: 'Reports', path: '/admin/reports', icon: <BarChart2 size={20} /> },
    { name: 'Settings', path: '/admin/settings', icon: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg> },
  ];

  return (
    <div className="admin-layout">
      {/* Mobile Sidebar Overlay */}
      <div
        className={`sidebar-overlay ${isSidebarOpen ? 'open' : ''}`}
        onClick={() => setIsSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''} ${isCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <img src="/logo.png" alt="Anand DMS" style={{ height: '60px', objectFit: 'contain' }} />
          {isSidebarOpen && (
            <button className="menu-toggle" onClick={() => setIsSidebarOpen(false)}>
              <X size={24} color="#fff" />
            </button>
          )}
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', position: 'relative' }}
              onClick={() => setIsSidebarOpen(false)}
            >
              {item.icon}
              <span className="nav-label" style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                {item.name}
              </span>
              
              {/* Badges moved outside nav-label so they can be shown/styled when collapsed */}
              {item.name === 'Orders' && pendingOrders > 0 && (
                <span className="sidebar-badge" style={{
                  background: '#ef4444',
                  color: 'white',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  marginLeft: isCollapsed ? '0' : 'auto',
                  position: isCollapsed ? 'absolute' : 'static',
                  top: isCollapsed ? '8px' : 'auto',
                  right: isCollapsed ? '8px' : 'auto',
                }}>
                  {pendingOrders}
                </span>
              )}
              {item.name === 'Inventory' && lowStockCount > 0 && (
                <span className="sidebar-badge" style={{
                  background: '#ef4444',
                  color: 'white',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  marginLeft: isCollapsed ? '0' : 'auto',
                  position: isCollapsed ? 'absolute' : 'static',
                  top: isCollapsed ? '8px' : 'auto',
                  right: isCollapsed ? '8px' : 'auto',
                }}>
                  {lowStockCount > 99 ? '99+' : lowStockCount}
                </span>
              )}
              {item.name === 'Claims & Credits' && pendingClaims > 0 && (
                <span className="sidebar-badge" style={{
                  background: '#ef4444',
                  color: 'white',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  marginLeft: isCollapsed ? '0' : 'auto',
                  position: isCollapsed ? 'absolute' : 'static',
                  top: isCollapsed ? '8px' : 'auto',
                  right: isCollapsed ? '8px' : 'auto',
                }}>
                  {pendingClaims}
                </span>
              )}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        <header className="top-header">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button className="menu-toggle" onClick={() => {
              if (window.innerWidth <= 768) setIsSidebarOpen(true);
              else setIsCollapsed(!isCollapsed);
            }}>
              <Menu size={24} />
            </button>
            <div className="header-title">
              <h3>{navItems.find(i => i.path === location.pathname)?.name || 'Admin'}</h3>
            </div>
          </div>
          <div className="user-profile" style={{ display: 'flex', alignItems: 'center' }}>
            <span className="user-name">{user.firm_name || 'Super Distributor'}</span>
            <button className="logout-header-btn" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </header>

        <div className="content-wrapper">
          <Outlet /> {/* This is where the page content will render */}
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;
