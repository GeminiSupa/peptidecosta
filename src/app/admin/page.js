"use client";

import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { useRouter } from 'next/navigation';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { 
  Lock, LayoutDashboard, ListFilter, Plus, Trash2, Mail, MessageCircle,
  Save, Upload, Share2, Clipboard, LogOut, Check, 
  AlertCircle, ChevronRight, ChevronUp, ChevronDown, MessageSquare, Database,
  Dna, FlaskConical, Syringe, TestTubes, Atom, 
  Brain, Shield, Moon, Flame, Zap, Sparkles, Microscope,
  KeyRound, ShoppingCart, Table, ClipboardList, Link2, Star, FileText, BarChart2, Users
} from 'lucide-react';
import AnalyticsDashboard from '@/components/admin/AnalyticsDashboard';
import CustomersCRM from '@/components/admin/CustomersCRM';
import ExportModal from '@/components/admin/ExportModal';

const FALLBACK_EXCHANGE_RATE = 454.48;

const CATEGORY_TRANSLATIONS = {
  'Weight Loss & Metabolism': 'Pérdida de peso y metabolismo',
  'Exercise Mimetic & Metabolic Modulator': 'Exercise Mimetic & Metabolic Modulator',
  'Recovery & Healing': 'Recuperación y curación',
  'Anti-Inflammatory': 'Antiinflamatorio',
  'Performance & Hormones': 'Rendimiento y hormonas',
  'Anti-Aging & Longevity': 'Antienvejecimiento y longevidad',
  'Immune System Modulation': 'Modulación del sistema inmunitario',
  'Cognitive & Mood': 'Cognitivo y estado de ánimo',
  'Sleep': 'Dormir',
  'Sexual Health': 'Salud sexual',
  'Tanning & Sexual Function': 'Bronceado y función sexual',
  'Skin & Hair': 'Piel y cabello',
  'Immune & Antioxidant': 'Sistema inmunitario y antioxidante',
  'Reconstitution Supply': 'Suministro de reconstitución'
};

export default function AdminPage() {
  const router = useRouter();
  
  // Authentication states
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const loggedInEmail = React.useRef(''); // persists the email used to sign in
  
  // Mounted state for hydration fix
  const [mounted, setMounted] = useState(false);

  // Dashboard state tabs: 'spreadsheet', 'orders', 'share'
  const [activeTab, setActiveTab] = useState('spreadsheet');

  // Spreadsheet product editor states
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [abandonedCarts, setAbandonedCarts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('All');
  const [loadingAbandonedCarts, setLoadingAbandonedCarts] = useState(true);
  const [sendingRecoveryEmail, setSendingRecoveryEmail] = useState({});
  const [reviews, setReviews] = useState([]);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [leads, setLeads] = useState([]);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [isDbConnected, setIsDbConnected] = useState(false);
  const [exchangeRate, setExchangeRate] = useState(FALLBACK_EXCHANGE_RATE);
  
  // CMS States
  const [blogs, setBlogs] = useState([]);
  const [loadingBlogs, setLoadingBlogs] = useState(true);
  const [siteSettings, setSiteSettings] = useState(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [cmsSaveStatus, setCmsSaveStatus] = useState('');
  const [cmsSaveLoading, setCmsSaveLoading] = useState(false);
  const [editingBlog, setEditingBlog] = useState(null);
  
  // CSV Import States
  const [csvDragActive, setCsvDragActive] = useState(false);
  const [csvStatus, setCsvStatus] = useState('');
  const [csvLoading, setCsvLoading] = useState(false);
  const [isCsvOpen, setIsCsvOpen] = useState(false);

  // Operation statuses
  const [saveStatus, setSaveStatus] = useState('');
  const [saveLoading, setSaveLoading] = useState(false);

  // Edit Description Modal States
  const [editDescModalOpen, setEditDescModalOpen] = useState(false);
  const [editDescProduct, setEditDescProduct] = useState(null);
  const [editDescEn, setEditDescEn] = useState('');
  const [editDescEs, setEditDescEs] = useState('');

  // Link share builder states
  const [shareLang, setShareLang] = useState('es');
  const [shareCurrency, setShareCurrency] = useState('CRC');
  const [shareCopied, setShareCopied] = useState(false);

  // Password change states
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Export Modal States
  const [exportModalType, setExportModalType] = useState(null); // 'orders' | 'products' | 'carts'
  const [exportLoading, setExportLoading] = useState(false);

  // Leads Editing States
  const [editingLeadId, setEditingLeadId] = useState(null);
  const [editLeadValue, setEditLeadValue] = useState('');
  const [editLeadMethod, setEditLeadMethod] = useState('');

  // Auth session check on mount
  useEffect(() => {
    setMounted(true);
    // Restore last used email
    const savedEmail = localStorage.getItem('admin_email') || 'info@peptidescostarica.net';
    loggedInEmail.current = savedEmail;

    if (isSupabaseConfigured && supabase) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          loggedInEmail.current = session.user.email || savedEmail;
          setIsAuthenticated(true);
          loadAdminData();
        }
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session) {
          setIsAuthenticated(true);
          loadAdminData();
        } else {
          setIsAuthenticated(false);
        }
      });

      return () => subscription.unsubscribe();
    } else {
      // If Supabase is not configured, we allow full frontend simulation
      console.log("Supabase not fully configured. Running in Local Simulation Mode.");
    }
  }, []);

  // Fetch live exchange rate
  useEffect(() => {
    const fetchRate = async () => {
      try {
        const cached = localStorage.getItem('exchangeRate_USDCRC');
        const cachedTime = localStorage.getItem('exchangeRate_USDCRC_time');
        if (cached && cachedTime && (Date.now() - parseInt(cachedTime)) < 3600000) {
          setExchangeRate(parseFloat(cached));
          return;
        }
        const res = await fetch('https://open.er-api.com/v6/latest/USD');
        const data = await res.json();
        if (data.rates && data.rates.CRC) {
          const rate = data.rates.CRC;
          setExchangeRate(rate);
          localStorage.setItem('exchangeRate_USDCRC', rate.toString());
          localStorage.setItem('exchangeRate_USDCRC_time', Date.now().toString());
        }
      } catch (err) {
        console.error('Admin: Live exchange rate fetch failed:', err);
      }
    };
    fetchRate();
  }, []);

  // Supabase Realtime subscription for live sync across all tables
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !isAuthenticated) return;

    const channel = supabase
      .channel('admin-realtime-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        loadAdminData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        loadAdminData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'abandoned_carts' }, () => {
        loadAdminData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_reviews' }, () => {
        loadAdminData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'catalog_leads' }, () => {
        loadAdminData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAuthenticated]);

  // Fetch admin products and orders
  const loadAdminData = async () => {
    setLoadingProducts(true);
    setLoadingOrders(true);
    let loadedProducts = [];

    // 1. Fetch Products
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .order('priority', { ascending: true });

        if (!error && data) {
          loadedProducts = data.map(item => ({
            id: item.id,
            product: item.product || '',
            category: item.category || '',
            priceUsd: item.price_usd || '',
            priceCrc: item.price_crc || '',
            originalPriceUsd: item.original_price_usd || '',
            originalPriceCrc: item.original_price_crc || '',
            discount: item.discount || '',
            status: item.status || 'In Stock',
            coa: item.coa || '',
            imageUrl: item.image_url || '',
            descriptionEn: item.description_en || '',
            descriptionEs: item.description_es || '',
            priority: item.priority || 0
          }));
          setIsDbConnected(true);
        }
      } catch (err) {
        console.error("Failed to load products from database:", err);
      }
    }

    // Fallback to local CSV products if database is empty or not configured
    if (loadedProducts.length === 0) {
      try {
        const response = await fetch('/master_sheet.csv');
        const csvText = await response.text();
        
        Papa.parse(csvText, {
          header: false,
          skipEmptyLines: true,
          complete: (results) => {
            const lines = results.data;
            const headerIndex = lines.findIndex(l => l.some(cell => cell && cell.toLowerCase().includes('product')));
            
            if (headerIndex !== -1) {
              const headers = lines[headerIndex].map(h => h.toLowerCase().trim());
              const dataLines = lines.slice(headerIndex + 1);

              const parsed = dataLines
                .filter(line => line[0])
                .map((line, idx) => {
                  const p = {};
                  headers.forEach((h, i) => {
                    const key = h.replace(/\s+/g, '');
                    if (key.includes('product') || key.includes('producto')) p.product = line[i];
                    else if (key.includes('category') || key.includes('categoría')) p.category = line[i];
                    else if (key.includes('price') || key.includes('precio')) p.priceUsd = line[i];
                    else if (key.includes('status') || key.includes('estado')) p.status = line[i];
                    else if (key.includes('discount(en)') || key.includes('descuento(en)')) p.bulkDiscountEn = line[i];
                    else if (key.includes('discount(es)') || key.includes('descuento(es)')) p.bulkDiscountEs = line[i];
                    else if (key.includes('coa')) p.coa = line[i];
                    else if (key.includes('image') || key.includes('imagen')) p.imageUrl = line[i];
                  });

                  const usdNum = parseFloat((p.priceUsd || '').replace(/[^0-9.]/g, '')) || 0;
                  const calculatedCrc = Math.round(usdNum * exchangeRate);

                  return {
                    id: `local-${idx}`,
                    product: p.product || '',
                    category: p.category || '',
                    priceUsd: p.priceUsd || '',
                    priceCrc: calculatedCrc > 0 ? `₡${calculatedCrc.toLocaleString('en-US')}` : '',
                    originalPriceUsd: '',
                    originalPriceCrc: '',
                    discount: p.bulkDiscountEs || p.bulkDiscountEn || '',
                    status: p.status || 'In Stock',
                    coa: p.coa || '',
                    imageUrl: p.imageUrl || '',
                    descriptionEn: '',
                    descriptionEs: '',
                    priority: idx
                  };
                });

              setProducts(parsed);
            }
          }
        });
      } catch (err) {
        console.error("Local CSV load error:", err);
      }
    } else {
      setProducts(loadedProducts);
    }
    setLoadingProducts(false);

    // 2. Fetch Orders
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && data) {
          setOrders(data);
        }
      } catch (err) {
        console.error("Failed to load orders from database:", err);
      }
    }
    setLoadingOrders(false);

    // 3. Fetch Abandoned Carts
    setLoadingAbandonedCarts(true);
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('abandoned_carts')
          .select('*')
          .eq('status', 'active')
          .order('last_updated', { ascending: false });

        if (!error && data) {
          setAbandonedCarts(data.filter(c => c.cart_data && c.cart_data.length > 0));
        }
      } catch (err) {
        console.error("Failed to load abandoned carts:", err);
      }
    }
    setLoadingAbandonedCarts(false);

    // 4. Fetch Reviews
    setLoadingReviews(true);
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('product_reviews')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && data) {
          setReviews(data);
        }
      } catch (err) {
        console.error("Failed to load reviews:", err);
      }
    }
    setLoadingReviews(false);

    // 5. Fetch Leads
    setLoadingLeads(true);
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('catalog_leads')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && data) {
          setLeads(data);
        }
      } catch (err) {
        console.error("Failed to load leads:", err);
      }
    }
    setLoadingLeads(false);

    // 5. Fetch Blogs
    setLoadingBlogs(true);
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase.from('blogs').select('*').order('created_at', { ascending: false });
        if (!error && data) setBlogs(data);
      } catch (err) { console.error("Failed to load blogs:", err); }
    }
    setLoadingBlogs(false);

    // 6. Fetch Site Settings
    setLoadingSettings(true);
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase.from('site_settings').select('*').eq('id', 'landing_page').single();
        if (!error && data) {
           setSiteSettings(data.value);
        } else {
           setSiteSettings({
              bannerActive: false,
              bannerTextEn: "Flash Sale: 10% Off All Peptides!",
              bannerTextEs: "Oferta Relámpago: ¡10% de descuento en todos los péptidos!",
              heroTitleEn: "Buy Peptides in Costa Rica",
              heroTitleEs: "Compra Péptidos en Costa Rica",
              heroSubEn: "Lab-Tested. High Purity. Fast Local Delivery.",
              heroSubEs: "Testados en Laboratorio. Alta Pureza. Entrega Local Rápida.",
              heroTextEn: "Your trusted local source for premium, research-grade peptides. Verified quality, transparent pricing, and secure checkout.",
              heroTextEs: "Tu fuente local de confianza para péptidos premium de grado investigación. Calidad verificada, precios transparentes y pago seguro."
           });
        }
      } catch (err) { console.error("Failed to load settings:", err); }
    }
    setLoadingSettings(false);
  };

  // Trigger loading when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      loadAdminData();
    }
  }, [isAuthenticated]);

  // Auth Handlers
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);

    if (isSupabaseConfigured && supabase) {
      // Always try Supabase Auth — this is the single source of truth
      try {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });

        if (!error) {
          // Success via Supabase — also update local cache so offline fallback stays in sync
          localStorage.setItem('admin_custom_password', password);
          loggedInEmail.current = email.trim(); // remember which email logged in
          setIsAuthenticated(true);
          setLoginError('');
          setLoginLoading(false);
          return;
        } else {
          // Supabase rejected — don't fall through, treat as real failure
          setLoginError('Invalid email or password.');
          setLoginLoading(false);
          return;
        }
      } catch (err) {
        console.error('Supabase login error:', err);
        // Network error — try local cache as last resort
      }
    }

    // Offline / no Supabase fallback only
    const storedPassword = localStorage.getItem('admin_custom_password') || 'CostaPeptides2026!';
    if (email.trim() === 'info@peptidescostarica.net' && password === storedPassword) {
      loggedInEmail.current = email.trim();
      setIsAuthenticated(true);
      setLoginError('');
    } else {
      setLoginError('Invalid admin credentials.');
    }

    setLoginLoading(false);
  };

  const handleLogout = async () => {
    if (isSupabaseConfigured && supabase) {
      await supabase.auth.signOut();
    }
    router.push('/');
  };

  // Change password handler
  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordStatus('');
    setPasswordLoading(true);

    // Validate new password fields
    if (newPassword.length < 6) {
      setPasswordStatus('error:Password must be at least 6 characters.');
      setPasswordLoading(false);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordStatus('error:New passwords do not match.');
      setPasswordLoading(false);
      return;
    }

    if (!isSupabaseConfigured || !supabase) {
      // Offline-only fallback
      const storedPassword = localStorage.getItem('admin_custom_password') || 'CostaPeptides2026!';
      if (currentPassword !== storedPassword) {
        setPasswordStatus('error:Current password is incorrect.');
        setPasswordLoading(false);
        return;
      }
      localStorage.setItem('admin_custom_password', newPassword);
      setPasswordStatus('success:Password updated locally.');
      setPasswordLoading(false);
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setTimeout(() => { setPasswordStatus(''); setShowPasswordModal(false); }, 2000);
      return;
    }

    try {
      // Step 1: Verify current password by signing in using the email that was used to log in
      const adminEmail = loggedInEmail.current || localStorage.getItem('admin_email') || 'info@peptidescostarica.net';
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: adminEmail,
        password: currentPassword
      });

      if (signInError) {
        // Current password is wrong — show the real reason
        setPasswordStatus(`error:Current password is incorrect. (${signInError.message})`);
        setPasswordLoading(false);
        return;
      }

      // Step 2: Actually change the password in Supabase Auth
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });

      if (updateError) {
        setPasswordStatus(`error:${updateError.message}`);
        setPasswordLoading(false);
        return;
      }

      // Step 3: Success — sync localStorage
      localStorage.setItem('admin_custom_password', newPassword);
      localStorage.setItem('admin_email', adminEmail);
      setPasswordStatus('success:Password updated! Please log in again with your new password.');
      setPasswordLoading(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      // Sign out so user is forced to log in fresh with new password
      setTimeout(async () => {
        setPasswordStatus('');
        setShowPasswordModal(false);
        await supabase.auth.signOut();
        setIsAuthenticated(false);
      }, 2500);

    } catch (err) {
      console.error('Password change error:', err);
      setPasswordStatus('error:An unexpected error occurred. Please try again.');
      setPasswordLoading(false);
    }
  };

  // Spreadsheet Cell modification helper
  const handleCellChange = (productId, fieldName, val) => {
    setProducts(prev => prev.map(p => 
      p.id === productId ? { ...p, [fieldName]: val } : p
    ));
  };

  // Add Product row
  const handleAddRow = () => {
    const newPriority = products.length > 0 ? Math.min(...products.map(p => Number(p.priority) || 0)) - 1 : 0;
    const newRow = {
      id: `temp-${Date.now()}`,
      product: 'New Peptide Name',
      category: 'Weight Loss & Metabolism',
      priceUsd: '$100',
      priceCrc: '₡45,448',
      originalPriceUsd: '',
      originalPriceCrc: '',
      discount: 'Buy 5+ vials, get 15% off',
      status: 'In Stock',
      coa: '',
      imageUrl: '',
      priority: newPriority
    };
    setProducts([newRow, ...products]);
  };

  // Delete row
  const handleDeleteRow = (productId) => {
    setProducts(products.filter(p => p.id !== productId));
  };

  // Move row up or down
  const handleMoveRow = (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= products.length) return;
    const updated = [...products];
    const [moved] = updated.splice(index, 1);
    updated.splice(newIndex, 0, moved);
    // Update priority values so the order persists on save
    const withPriority = updated.map((p, i) => ({ ...p, priority: i }));
    setProducts(withPriority);
  };

  // CSV drag uploader
  const handleCsvDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setCsvDragActive(true);
    } else if (e.type === "dragleave") {
      setCsvDragActive(false);
    }
  };

  const handleCsvDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setCsvDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      parseUploadedCsv(e.dataTransfer.files[0]);
    }
  };

  const handleCsvFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      parseUploadedCsv(e.target.files[0]);
    }
  };

  const parseUploadedCsv = (file) => {
    setCsvLoading(true);
    setCsvStatus('');

    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      complete: (results) => {
        const lines = results.data;
        const headerIndex = lines.findIndex(l => l.some(cell => cell && cell.toLowerCase().includes('product')));

        if (headerIndex === -1) {
          setCsvStatus("Could not find product header row. Please verify CSV columns.");
          setCsvLoading(false);
          return;
        }

        const headers = lines[headerIndex].map(h => h.toLowerCase().trim());
        const dataLines = lines.slice(headerIndex + 1);

        const imported = dataLines
          .filter(line => line[0])
          .map((line, idx) => {
            const p = {};
            headers.forEach((h, i) => {
              const key = h.replace(/\s+/g, '');
              if (key.includes('product') || key.includes('producto')) p.product = line[i];
              else if (key.includes('category') || key.includes('categoría')) p.category = line[i];
              else if (key.includes('price') || key.includes('precio')) p.priceUsd = line[i];
              else if (key.includes('status') || key.includes('estado')) p.status = line[i];
              else if (key.includes('discount(en)') || key.includes('descuento(en)')) p.bulkDiscountEn = line[i];
              else if (key.includes('discount(es)') || key.includes('descuento(es)')) p.bulkDiscountEs = line[i];
              else if (key.includes('coa')) p.coa = line[i];
              else if (key.includes('image') || key.includes('imagen')) p.imageUrl = line[i];
            });

            const usdNum = parseFloat((p.priceUsd || '').replace(/[^0-9.]/g, '')) || 0;
            const calculatedCrc = Math.round(usdNum * exchangeRate);

            return {
              id: `imported-${idx}-${Date.now()}`,
              product: p.product || '',
              category: p.category || '',
              priceUsd: p.priceUsd || '',
              priceCrc: p.priceCrc || (calculatedCrc > 0 ? `₡${calculatedCrc.toLocaleString('en-US')}` : ''),
              originalPriceUsd: '',
              originalPriceCrc: '',
              discount: p.bulkDiscountEs || p.bulkDiscountEn || '',
              status: p.status || 'In Stock',
              coa: p.coa || '',
              imageUrl: p.imageUrl || '',
              priority: idx
            };
          });

        setProducts(imported);
        setCsvStatus(`Successfully loaded ${imported.length} products from CSV into grid. Click "Save Changes" to sync database.`);
        setCsvLoading(false);
      },
      error: (err) => {
        setCsvStatus(`Parsing error: ${err.message}`);
        setCsvLoading(false);
      }
    });
  };

  // Image Upload handler for cell
  const handleImageCellUpload = async (productId, e) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];

    // Show indicator
    handleCellChange(productId, 'imageUrl', 'Uploading...');

    if (isSupabaseConfigured && supabase) {
      try {
        // 1. Delete old image from storage if it exists
        const currentProduct = products.find(p => p.id === productId);
        if (currentProduct && currentProduct.imageUrl && currentProduct.imageUrl.includes('product-pics')) {
          try {
            // Extract file name from the public URL
            const urlParts = currentProduct.imageUrl.split('/product-pics/');
            if (urlParts[1]) {
              const oldFileName = decodeURIComponent(urlParts[1].split('?')[0]);
              await supabase.storage.from('product-pics').remove([oldFileName]);
              console.log('Old image deleted:', oldFileName);
            }
          } catch (delErr) {
            console.warn('Could not delete old image (non-critical):', delErr);
          }
        }

        // 2. Upload new image
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('product-pics')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        // 3. Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('product-pics')
          .getPublicUrl(filePath);

        handleCellChange(productId, 'imageUrl', publicUrl);
      } catch (err) {
        console.error("Storage upload error:", err);
        handleCellChange(productId, 'imageUrl', '');
        alert("Image upload failed. Please verify that your Supabase Storage bucket 'product-pics' exists and is set to public.");
      }
    } else {
      // Local simulation URL
      const dummyUrl = URL.createObjectURL(file);
      handleCellChange(productId, 'imageUrl', dummyUrl);
      alert("Local Simulation: Image loaded inside browser memory. To upload permanently, connect Supabase!");
    }
  };

  // Order status update
  const handleOrderStatusUpdate = async (orderId, newStatus) => {
    setOrders(orders.map(o => o.id === orderId ? { ...o, status: newStatus } : o));

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase
          .from('orders')
          .update({ status: newStatus })
          .eq('id', orderId);

        if (newStatus === 'Completed') {
          const updatedOrder = orders.find(o => o.id === orderId);
          if (updatedOrder && updatedOrder.customer_email) {
            fetch('/api/order-shipped-notification', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...updatedOrder, status: newStatus })
            }).then(res => res.json()).then(data => {
              if (data.success) {
                alert(`Shipping tracking email successfully sent to ${updatedOrder.customer_email}`);
              }
            }).catch(err => console.error('Failed to send shipping email:', err));
          }
        }
      } catch(err) {
        console.error("Order status update error:", err);
      }
    }
  };

  // Order tracking update
  const handleOrderTrackingUpdate = async (orderId, trackingNumber) => {
    setOrders(orders.map(o => o.id === orderId ? { ...o, tracking_number: trackingNumber } : o));

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase
          .from('orders')
          .update({ tracking_number: trackingNumber })
          .eq('id', orderId);
      } catch(err) {
        console.error("Order tracking update error:", err);
      }
    }
  };

  // Delete a single order
  const handleDeleteOrder = async (orderId) => {
    if (!confirm('Delete this order? This cannot be undone.')) return;
    setOrders(prev => prev.filter(o => o.id !== orderId));
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('orders').delete().eq('id', orderId);
      } catch(err) {
        console.error('Order delete error:', err);
      }
    }
  };

  // Delete a single abandoned cart entry
  const handleDeleteCart = async (sessionId) => {
    if (!confirm('Remove this cart entry? This cannot be undone.')) return;
    setAbandonedCarts(prev => prev.filter(c => c.session_id !== sessionId));
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('abandoned_carts').delete().eq('session_id', sessionId);
      } catch(err) {
        console.error('Cart delete error:', err);
      }
    }
  };

  // Send recovery email
  const handleSendRecoveryEmail = async (acart) => {
    setSendingRecoveryEmail(prev => ({ ...prev, [acart.session_id]: true }));
    try {
      const response = await fetch('/api/abandoned-cart-notification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: acart.session_id,
          customer_name: acart.customer_name,
          customer_email: acart.customer_email,
          cart_data: acart.cart_data,
          lang: acart.lang || 'es',
          currency: acart.currency || 'CRC',
        }),
      });

      const result = await response.json();
      if (response.ok && result.success) {
        alert('Recovery email sent successfully!');
        loadAdminData();
      } else {
        alert('Failed to send recovery email: ' + (result.error || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
      alert('Failed to send recovery email: ' + err.message);
    } finally {
      setSendingRecoveryEmail(prev => ({ ...prev, [acart.session_id]: false }));
    }
  };

  // Clear ALL active abandoned carts
  const handleClearAllCarts = async () => {
    if (!confirm('Clear ALL active cart data? This cannot be undone.')) return;
    setAbandonedCarts([]);
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('abandoned_carts').delete().eq('status', 'active');
      } catch(err) {
        console.error('Clear carts error:', err);
      }
    }
  };

  // Centralized Export Handler
  const handleExport = (format) => {
    setExportLoading(true);
    setTimeout(() => {
      try {
        let headers = [];
        let dataRows = [];
        let filename = `peptidescr-export-${new Date().toISOString().slice(0, 10)}`;
        let title = 'Export';

        if (exportModalType === 'orders') {
          headers = [ 'Order ID', 'Order Number', 'Date', 'Customer Name', 'Phone', 'Shipping Address', 'Status', 'Payment Method', 'Items', 'Total (CRC)', 'Total (USD)' ];
          dataRows = orders.map(order => {
             const items = Array.isArray(order.items) ? order.items : [];
             const itemsSummary = items.map(i => `${i.product} x${i.qty}`).join(' | ');
             const orderDate = new Date(order.created_at).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' });
             return [ order.id, order.order_number || 'N/A', orderDate, order.customer_name || 'N/A', order.customer_phone || '', order.shipping_address || 'N/A', order.status || 'Pending', order.payment_method || 'whatsapp', itemsSummary, order.total_crc || '', order.total_usd || '' ];
          });
          filename = `peptidescr-orders-${new Date().toISOString().slice(0, 10)}`;
          title = 'Costa Rica Peptides - Orders Export';
        } else if (exportModalType === 'products') {
          headers = [ 'Product Name', 'Category', 'Price (USD)', 'Price (CRC)', 'Status', 'Bulk Discount' ];
          dataRows = products.map(p => [ p.product, p.category, p.priceUsd, p.priceCrc, p.status, p.discount ]);
          filename = `peptidescr-products-${new Date().toISOString().slice(0, 10)}`;
          title = 'Costa Rica Peptides - Products Export';
        } else if (exportModalType === 'carts') {
          headers = [ 'Session ID', 'Date', 'Customer Name', 'Phone', 'Email', 'Cart Items', 'Status' ];
          dataRows = abandonedCarts.map(c => {
             const itemsSummary = c.cart_data ? c.cart_data.map(i => `${i.product} x${i.qty}`).join(' | ') : '';
             const date = new Date(c.last_updated).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' });
             return [ c.session_id, date, c.customer_name || '', c.customer_phone || '', c.customer_email || '', itemsSummary, c.status ];
          });
          filename = `peptidescr-carts-${new Date().toISOString().slice(0, 10)}`;
          title = 'Costa Rica Peptides - Abandoned Carts Export';
        } else if (exportModalType === 'leads') {
          headers = [ 'Lead ID', 'Date Captured', 'Method', 'Contact Info', 'Language' ];
          dataRows = leads.map(l => [ l.id, new Date(l.created_at).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' }), l.contact_method, l.contact_value, l.language ]);
          filename = `peptidescr-leads-${new Date().toISOString().slice(0, 10)}`;
          title = 'Costa Rica Peptides - Catalog Leads Export';
        }

        if (format === 'csv') {
          const csvContent = [headers, ...dataRows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
          const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a'); link.href = url; link.download = `${filename}.csv`;
          document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
        } else if (format === 'xlsx') {
          const worksheetData = [headers, ...dataRows];
          const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
          const wscols = headers.map(h => ({ wch: Math.max(15, h.length + 2) }));
          worksheet['!cols'] = wscols;
          const workbook = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
          XLSX.writeFile(workbook, `${filename}.xlsx`);
        } else if (format === 'pdf') {
          const doc = new jsPDF('landscape');
          doc.setFontSize(16);
          doc.text(title, 14, 15);
          doc.setFontSize(10);
          doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 22);
          doc.autoTable({
            head: [headers],
            body: dataRows,
            startY: 28,
            styles: { fontSize: 7, cellPadding: 2 },
            headStyles: { fillColor: [14, 22, 38], textColor: 255 },
            alternateRowStyles: { fillColor: [240, 240, 240] }
          });
          doc.save(`${filename}.pdf`);
        }
      } finally {
        setExportLoading(false);
        setExportModalType(null);
      }
    }, 500);
  };

  // Leads Actions
  const handleLeadUpdate = async (id) => {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, contact_value: editLeadValue, contact_method: editLeadMethod } : l));
    setEditingLeadId(null);

    if (isSupabaseConfigured) {
      try {
        await supabase
          .from('catalog_leads')
          .update({ contact_value: editLeadValue, contact_method: editLeadMethod })
          .eq('id', id);
      } catch (err) {
        console.error("Failed to update lead:", err);
      }
    }
  };
  
  const handleLeadDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this lead?")) return;
    
    setLeads(prev => prev.filter(l => l.id !== id));
    
    if (isSupabaseConfigured) {
      try {
        await supabase
          .from('catalog_leads')
          .delete()
          .eq('id', id);
      } catch (err) {
        console.error("Failed to delete lead:", err);
      }
    }
  };

  // Save changes batch
  const handleSaveChanges = async () => {
    setSaveLoading(true);
    setSaveStatus('');

    // Auto-fill missing CRC prices from USD before saving
    const filled = products.map(p => {
      let newP = { ...p };
      if (newP.priceUsd && (!newP.priceCrc || newP.priceCrc.trim() === '')) {
        const usdNum = parseFloat(String(newP.priceUsd).replace(/[^0-9.]/g, '')) || 0;
        if (usdNum > 0) {
          newP.priceCrc = `₡${Math.round(usdNum * exchangeRate).toLocaleString('en-US')}`;
        }
      }
      if (newP.originalPriceUsd && (!newP.originalPriceCrc || newP.originalPriceCrc.trim() === '')) {
        const origUsdNum = parseFloat(String(newP.originalPriceUsd).replace(/[^0-9.]/g, '')) || 0;
        if (origUsdNum > 0) {
          newP.originalPriceCrc = `₡${Math.round(origUsdNum * exchangeRate).toLocaleString('en-US')}`;
        }
      }
      return newP;
    });
    // Update state so the UI reflects the auto-filled values
    setProducts(filled);

    if (isSupabaseConfigured && supabase) {
      try {
        // Get all currently existing database UUIDs from the active list
        const activeIds = filled
          .map(p => p.id)
          .filter(id => id && !id.toString().startsWith('temp-') && !id.toString().startsWith('local-'));

        // 1. Delete products that were removed in the editor
        let deleteQuery = supabase.from('products').delete();
        if (activeIds.length > 0) {
          deleteQuery = deleteQuery.not('id', 'in', `(${activeIds.join(',')})`);
        } else {
          // If no products remain, delete all safely
          deleteQuery = deleteQuery.neq('id', '00000000-0000-0000-0000-000000000000');
        }
        const { error: deleteError } = await deleteQuery;
        if (deleteError) throw deleteError;

        // 2. Format row fields
        const itemsToUpdate = [];
        const itemsToInsert = [];

        filled.forEach((p, idx) => {
          const row = {
            product: p.product,
            category: p.category,
            price_usd: p.priceUsd,
            price_crc: p.priceCrc,
            original_price_usd: p.originalPriceUsd || null,
            original_price_crc: p.originalPriceCrc || null,
            discount: p.discount,
            status: p.status,
            coa: p.coa,
            image_url: p.imageUrl,
            description_en: p.descriptionEn || '',
            description_es: p.descriptionEs || '',
            emoji: p.imageUrl ? '' : getEmojiForCategory(p.category),
            priority: idx
          };
          if (p.id && !p.id.toString().startsWith('temp-') && !p.id.toString().startsWith('local-')) {
            row.id = p.id;
            itemsToUpdate.push(row);
          } else {
            itemsToInsert.push(row);
          }
        });

        // 3. Batch upsert existing records
        if (itemsToUpdate.length > 0) {
          const { error: upsertError } = await supabase
            .from('products')
            .upsert(itemsToUpdate);
          if (upsertError) throw upsertError;
        }

        // 4. Batch insert new records
        if (itemsToInsert.length > 0) {
          const { error: insertError } = await supabase
            .from('products')
            .insert(itemsToInsert);
          if (insertError) throw insertError;
        }

        setSaveStatus("Changes successfully saved to database!");
        loadAdminData(); // reload fresh rows
      } catch (err) {
        console.error("Database save changes error:", err);
        setSaveStatus(`Failed to save: ${err.message || 'Row Level Security error'}`);
      }
    } else {
      setSaveStatus("Local Simulation: Saved products data state inside browser memory!");
    }

    setSaveLoading(false);
    setTimeout(() => setSaveStatus(''), 4000);
  };

  const getEmojiForCategory = (cat) => {
    const c = (cat || '').toLowerCase();
    if (c.includes('weight') || c.includes('peso')) return '⚖️';
    if (c.includes('sleep') || c.includes('sueño')) return '🌙';
    if (c.includes('sexual')) return '🔥';
    if (c.includes('skin') || c.includes('piel')) return '✨';
    if (c.includes('immune') || c.includes('inmune')) return '🛡️';
    if (c.includes('supply') || c.includes('suministro')) return '💧';
    if (c.includes('brain') || c.includes('cerebro')) return '🧠';
    if (c.includes('muscle') || c.includes('músculo')) return '💪';
    return '🧪';
  };

  const handleApproveReview = async (id) => {
    if (!supabase) return;
    try {
      const { error } = await supabase.from('product_reviews').update({ status: 'Approved' }).eq('id', id);
      if (!error) {
        setReviews(reviews.map(r => r.id === id ? { ...r, status: 'Approved' } : r));
      }
    } catch (err) { console.error(err); }
  };

  const handleDeleteReview = async (id) => {
    if (!supabase) return;
    if (!confirm('Are you sure you want to delete this review?')) return;
    try {
      const { error } = await supabase.from('product_reviews').delete().eq('id', id);
      if (!error) {
        setReviews(reviews.filter(r => r.id !== id));
      }
    } catch (err) { console.error(err); }
  };

  // Science/peptide themed icon for visual rendering (no pills!)
  const getCategoryIcon = (cat, size = 20) => {
    const c = (cat || '').toLowerCase();
    const props = { size, className: 'category-icon', strokeWidth: 1.8 };
    if (c.includes('weight') || c.includes('peso') || c.includes('metaboli')) return <Atom {...props} />;
    if (c.includes('exercise') || c.includes('mimetic')) return <Zap {...props} />;
    if (c.includes('recovery') || c.includes('healing') || c.includes('recuper')) return <Dna {...props} />;
    if (c.includes('anti-inflam') || c.includes('antiinflam')) return <Shield {...props} />;
    if (c.includes('performance') || c.includes('hormon') || c.includes('rendimiento')) return <Syringe {...props} />;
    if (c.includes('aging') || c.includes('longevity') || c.includes('envejecimiento')) return <TestTubes {...props} />;
    if (c.includes('immune') || c.includes('inmune') || c.includes('antioxidant')) return <Microscope {...props} />;
    if (c.includes('cognitive') || c.includes('mood') || c.includes('cognitivo')) return <Brain {...props} />;
    if (c.includes('sleep') || c.includes('dormir') || c.includes('sueño')) return <Moon {...props} />;
    if (c.includes('sexual') || c.includes('tanning') || c.includes('bronceado')) return <Flame {...props} />;
    if (c.includes('skin') || c.includes('hair') || c.includes('piel') || c.includes('cabello')) return <Sparkles {...props} />;
    if (c.includes('supply') || c.includes('suministro') || c.includes('reconstitution')) return <FlaskConical {...props} />;
    return <FlaskConical {...props} />;
  };

  // Copy shareable link
  const getShareUrl = () => {
    const domain = typeof window !== 'undefined' ? window.location.origin : 'https://costapeptides.vercel.app';
    return `${domain}/catalog?lang=${shareLang}&currency=${shareCurrency}`;
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(getShareUrl());
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  };

  // CMS Handlers
  const handleSaveSiteSettings = async () => {
    setCmsSaveLoading(true);
    setCmsSaveStatus('');
    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase.from('site_settings').upsert({
          id: 'landing_page',
          value: siteSettings
        });
        if (error) throw error;
        setCmsSaveStatus('success:Settings saved successfully.');
      } catch (err) {
        console.error("Failed to save settings:", err);
        setCmsSaveStatus(`error:Failed to save settings (${err.message})`);
      }
    }
    setCmsSaveLoading(false);
    setTimeout(() => setCmsSaveStatus(''), 3000);
  };

  const handleSaveBlog = async (e) => {
    e.preventDefault();
    setCmsSaveLoading(true);
    setCmsSaveStatus('');
    if (isSupabaseConfigured && supabase) {
      try {
        const isNew = !editingBlog.id;
        const payload = {
          slug: editingBlog.slug,
          title_en: editingBlog.title_en,
          title_es: editingBlog.title_es,
          excerpt_en: editingBlog.excerpt_en,
          excerpt_es: editingBlog.excerpt_es,
          content_en: editingBlog.content_en,
          content_es: editingBlog.content_es,
          image_url: editingBlog.image_url,
          published: editingBlog.published
        };
        
        let error;
        if (isNew) {
          const res = await supabase.from('blogs').insert(payload).select();
          error = res.error;
          if (!error && res.data) setBlogs([res.data[0], ...blogs]);
        } else {
          const res = await supabase.from('blogs').update(payload).eq('id', editingBlog.id).select();
          error = res.error;
          if (!error && res.data) setBlogs(blogs.map(b => b.id === editingBlog.id ? res.data[0] : b));
        }
        
        if (error) throw error;
        setCmsSaveStatus('success:Blog post saved successfully.');
        setEditingBlog(null);
      } catch (err) {
        console.error("Failed to save blog:", err);
        setCmsSaveStatus(`error:Failed to save blog (${err.message})`);
      }
    }
    setCmsSaveLoading(false);
    setTimeout(() => setCmsSaveStatus(''), 3000);
  };

  const handleDeleteBlog = async (id) => {
    if (!confirm('Are you sure you want to delete this blog post?')) return;
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('blogs').delete().eq('id', id);
        setBlogs(blogs.filter(b => b.id !== id));
      } catch (err) {
        console.error("Failed to delete blog:", err);
      }
    }
  };

  // Prevent hydration mismatch by skipping SSR for admin portal entirely
  if (!mounted) return null;

  // Render Login Card if not logged in
  if (!isAuthenticated) {
    return (
      <div className="admin-layout" suppressHydrationWarning>
        <div className="admin-login-container">
          <div className="admin-login-card">
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
              <img src="/logo.png" alt="Peptides Costa Rica Admin" style={{ maxHeight: '60px', width: 'auto', objectFit: 'contain', borderRadius: '12px', boxShadow: '0 2px 16px rgba(0,0,0,0.25)' }} />
            </div>
            <p>Admin Security Dashboard</p>
            
            {loginError && <div className="error-msg">{loginError}</div>}
            
            <form onSubmit={handleLogin}>
              <input 
                type="email" 
                placeholder="Admin Email Address" 
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <input 
                type="password" 
                placeholder="Access Password" 
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button type="submit" disabled={loginLoading}>
                {loginLoading ? (
                  <div className="sync-spinner" style={{ width: '16px', height: '16px' }}></div>
                ) : (
                  'Authenticate Access'
                )}
              </button>
            </form>
            <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '20px', lineHeight: '1.4' }}>
              ✨ Local Bypass Support: Log in instantly with credentials listed in your approved implementation plan.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-layout min-h-screen" suppressHydrationWarning>
      {/* Navbar Header */}
      <nav className="admin-navbar">
        <div className="admin-nav-top-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '12px' }}>
          <div className="admin-nav-logo" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img src="/logo.png" alt="Logo" style={{ maxHeight: '38px', width: 'auto', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 1px 8px rgba(0,0,0,0.2)' }} />
            <span className="db-status-badge" style={{ background: '#1e293b', color: '#94a3b8', fontSize: '0.65rem', padding: '4px 8px', borderRadius: '4px' }}>
              {isDbConnected ? 'Live DB' : 'Simulation'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button 
              className="admin-logout-btn" 
              onClick={() => setShowPasswordModal(true)} 
              style={{ flexShrink: 0, background: 'rgba(56, 189, 248, 0.1)', borderColor: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8' }}
              title="Change Password"
            >
              <KeyRound size={14} style={{ display: 'inline', marginRight: '4px' }} />
              Password
            </button>
            <button className="admin-logout-btn" onClick={handleLogout} style={{ flexShrink: 0 }}>
              <LogOut size={14} style={{ display: 'inline', marginRight: '4px' }} />
              Logout
            </button>
          </div>
        </div>
        <div className="admin-nav-actions">
          <button 
            className={`admin-tab-btn ${activeTab === 'spreadsheet' ? 'active' : ''}`}
            onClick={() => setActiveTab('spreadsheet')}
          >
            <Table size={14} />
            <span className="tab-label">Products</span>
          </button>
          <button 
            className={`admin-tab-btn ${activeTab === 'orders' ? 'active' : ''}`}
            onClick={() => setActiveTab('orders')}
          >
            <ClipboardList size={14} />
            <span className="tab-label">Orders</span>
            {orders.length > 0 && <span className="tab-count" style={{ background: '#ef4444' }}>{orders.length}</span>}
          </button>
          <button 
            className={`admin-tab-btn ${activeTab === 'customers' ? 'active' : ''}`}
            onClick={() => setActiveTab('customers')}
          >
            <Users size={14} />
            <span className="tab-label">Customers</span>
          </button>
          <button 
            className={`admin-tab-btn ${activeTab === 'leads' ? 'active' : ''}`}
            onClick={() => setActiveTab('leads')}
          >
            <Check size={14} />
            <span className="tab-label">Leads</span>
            {leads.length > 0 && <span className="tab-count" style={{ background: '#10b981' }}>{leads.length}</span>}
          </button>
          <button 
            className={`admin-tab-btn ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveTab('analytics')}
          >
            <BarChart2 size={14} />
            <span className="tab-label">Analytics</span>
          </button>
          <button 
            className={`admin-tab-btn ${activeTab === 'share' ? 'active' : ''}`}
            onClick={() => setActiveTab('share')}
          >
            <Link2 size={14} />
            <span className="tab-label">Share</span>
          </button>
          <button 
            className={`admin-tab-btn ${activeTab === 'abandoned' ? 'active' : ''}`}
            onClick={() => setActiveTab('abandoned')}
          >
            <ShoppingCart size={14} />
            <span className="tab-label">Carts</span>
            {abandonedCarts.length > 0 && <span className="tab-count" style={{ background: '#f59e0b' }}>{abandonedCarts.length}</span>}
          </button>
          <button 
            className={`admin-tab-btn ${activeTab === 'reviews' ? 'active' : ''}`}
            onClick={() => setActiveTab('reviews')}
          >
            <Star size={14} />
            <span className="tab-label">Reviews</span>
            {reviews.filter(r => r.status === 'Pending').length > 0 && <span className="tab-count" style={{ background: '#3b82f6' }}>{reviews.filter(r => r.status === 'Pending').length}</span>}
          </button>
          <button 
            className={`admin-tab-btn ${activeTab === 'cms' ? 'active' : ''}`}
            onClick={() => setActiveTab('cms')}
          >
            <FileText size={14} />
            <span className="tab-label">Content (CMS)</span>
          </button>
        </div>
      </nav>

      {/* Main Admin dashboard container */}
      <div className="admin-container">
        
        {/* TAB 1: SPREADSHEET EDITOR */}
        {activeTab === 'spreadsheet' && (
          <div>
            <div className="admin-toolbar">
              <div>
                <h3>Master Inventory Products</h3>
                <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '4px' }}>
                  Edit details in place exactly like Excel. Changes will sync live to customers once you click **Save Changes**.
                </p>
              </div>
              <div className="admin-actions-row">
                <button className="admin-btn" onClick={() => setIsCsvOpen(!isCsvOpen)}>
                  <Upload size={16} />
                  {isCsvOpen ? 'Hide CSV Importer' : 'Import CSV'}
                </button>
                <button className="admin-btn admin-btn-accent" onClick={handleAddRow}>
                  <Plus size={16} />
                  Add Product Row
                </button>
                <button className="admin-btn admin-btn-primary" onClick={handleSaveChanges} disabled={saveLoading}>
                  <Save size={16} />
                  {saveLoading ? 'Syncing DB...' : 'Save Changes'}
                </button>
                {products.length > 0 && (
                  <button
                    className="admin-btn"
                    onClick={() => setExportModalType('products')}
                    style={{ background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.2)' }}
                  >
                    <Upload size={14} />
                    Export Data
                  </button>
                )}
              </div>
            </div>

            {saveStatus && (
              <div className="csv-status-banner" style={{ background: saveStatus.includes('Failed') ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)', borderColor: saveStatus.includes('Failed') ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)', color: saveStatus.includes('Failed') ? '#f87171' : '#4ade80' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {saveStatus.includes('Failed') ? <AlertCircle size={16} /> : <Check size={16} />}
                  <span>{saveStatus}</span>
                </div>
              </div>
            )}

            {/* Collapsible Google sheet drag uploader */}
            {isCsvOpen && (
              <div 
                className={`csv-dropzone ${csvDragActive ? 'drag-active' : ''}`}
                onDragEnter={handleCsvDrag}
                onDragOver={handleCsvDrag}
                onDragLeave={handleCsvDrag}
                onDrop={handleCsvDrop}
              >
                <Upload className="csv-dropzone-icon" />
                <h4>Import Google Spreadsheet CSV</h4>
                <p>Drag and drop your exported `master_sheet.csv` here, or click to browse files from your computer.</p>
                <input 
                  type="file" 
                  accept=".csv" 
                  style={{ display: 'none' }} 
                  id="csvFileInput" 
                  onChange={handleCsvFileSelect}
                />
                <button 
                  className="admin-btn" 
                  style={{ marginTop: '8px' }}
                  onClick={() => document.getElementById('csvFileInput').click()}
                >
                  Choose CSV File
                </button>
              </div>
            )}

            {csvStatus && (
              <div className="csv-status-banner" style={{ background: 'rgba(56, 189, 248, 0.15)', borderColor: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8' }}>
                <span>{csvStatus}</span>
                <button className="admin-btn" style={{ fontSize: '0.7rem', padding: '4px 8px' }} onClick={() => setCsvStatus('')}>Dismiss</button>
              </div>
            )}

            {/* Main Spreadsheet grid */}
            {loadingProducts ? (
              <div className="loader">
                <div className="sync-spinner" style={{ marginBottom: '16px' }}></div>
                <div>Fetching master inventory table...</div>
              </div>
            ) : (
              <div className="spreadsheet-container">
                <table className="spreadsheet-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>#</th>
                      <th style={{ minWidth: '220px' }}>Product Peptide Name</th>
                      <th style={{ minWidth: '180px' }}>Category</th>
                      <th style={{ width: '100px' }}>Price (USD)</th>
                      <th style={{ width: '100px' }}>Price (CRC)</th>
                      <th style={{ width: '110px' }}>Orig. Price (USD)</th>
                      <th style={{ width: '110px' }}>Orig. Price (CRC)</th>
                      <th style={{ minWidth: '180px' }}>Stock Status</th>
                      <th style={{ minWidth: '180px' }}>Volume/Bulk Discount Info</th>
                      <th style={{ minWidth: '200px' }}>Image URL / Physical Upload</th>
                      <th style={{ minWidth: '220px' }}>COA URL Link</th>
                      <th style={{ width: '120px', textAlign: 'center' }}>Info/Blog</th>
                      <th style={{ width: '100px', textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p, idx) => (
                      <tr key={p.id}>
                        <td data-label="#" style={{ color: '#64748b', fontWeight: 'bold', textAlign: 'center' }}>{idx + 1}</td>
                        
                        {/* Name */}
                        <td data-label="Product Peptide Name">
                          <div 
                            contentEditable 
                            suppressContentEditableWarning
                            className="cell-editable"
                            onBlur={(e) => handleCellChange(p.id, 'product', e.target.innerText)}
                          >
                            {p.product}
                          </div>
                        </td>

                        {/* Category */}
                        <td data-label="Category">
                          <select 
                            className="cell-select"
                            value={p.category}
                            onChange={(e) => {
                              if (e.target.value === '__ADD_NEW__') {
                                const newCat = window.prompt("Enter new category (Format: English / Español):");
                                if (newCat && newCat.trim() !== "") {
                                  handleCellChange(p.id, 'category', newCat.trim());
                                }
                              } else {
                                handleCellChange(p.id, 'category', e.target.value);
                              }
                            }}
                          >
                            {Array.from(new Set([
                              ...Object.keys(CATEGORY_TRANSLATIONS),
                              ...products.map(prod => prod.category).filter(Boolean)
                            ])).sort().map(cat => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                            <option disabled>──────────</option>
                            <option value="__ADD_NEW__">➕ Create New Category...</option>
                          </select>
                        </td>

                        {/* USD Price */}
                        <td data-label="Price (USD)">
                          <div 
                            contentEditable 
                            suppressContentEditableWarning
                            className="cell-editable"
                            onBlur={(e) => {
                              const v = e.target.innerText;
                              handleCellChange(p.id, 'priceUsd', v);
                              // Auto calculate CRC price whenever USD changes
                              const usdNum = parseFloat(v.replace(/[^0-9.]/g, '')) || 0;
                              if (usdNum > 0) {
                                const calc = Math.round(usdNum * exchangeRate);
                                handleCellChange(p.id, 'priceCrc', `₡${calc.toLocaleString('en-US')}`);
                              }
                            }}
                          >
                            {p.priceUsd}
                          </div>
                        </td>

                        {/* CRC Price */}
                        <td data-label="Price (CRC)">
                          <div 
                            contentEditable 
                            suppressContentEditableWarning
                            className="cell-editable"
                            onBlur={(e) => handleCellChange(p.id, 'priceCrc', e.target.innerText)}
                          >
                            {p.priceCrc}
                          </div>
                        </td>

                        {/* Orig USD Price */}
                        <td data-label="Orig. Price (USD)">
                          <div 
                            contentEditable 
                            suppressContentEditableWarning
                            className="cell-editable"
                            onBlur={(e) => {
                              const v = e.target.innerText;
                              handleCellChange(p.id, 'originalPriceUsd', v);
                              const origUsdNum = parseFloat(v.replace(/[^0-9.]/g, '')) || 0;
                              if (origUsdNum > 0) {
                                const calc = Math.round(origUsdNum * exchangeRate);
                                handleCellChange(p.id, 'originalPriceCrc', `₡${calc.toLocaleString('en-US')}`);
                              }
                            }}
                          >
                            {p.originalPriceUsd}
                          </div>
                        </td>

                        {/* Orig CRC Price */}
                        <td data-label="Orig. Price (CRC)">
                          <div 
                            contentEditable 
                            suppressContentEditableWarning
                            className="cell-editable"
                            onBlur={(e) => handleCellChange(p.id, 'originalPriceCrc', e.target.innerText)}
                          >
                            {p.originalPriceCrc}
                          </div>
                        </td>

                        {/* Status */}
                        <td data-label="Stock Status">
                          <select 
                            className="cell-select"
                            value={p.status}
                            onChange={(e) => handleCellChange(p.id, 'status', e.target.value)}
                            style={{ 
                              color: p.status.toLowerCase().includes('in stock') || p.status.toLowerCase().includes('disponible') ? '#4ade80' : p.status.toLowerCase().includes('coming soon') || p.status.toLowerCase().includes('próximamente') ? '#facc15' : '#f87171',
                              fontWeight: 'bold'
                            }}
                          >
                            <option value="In Stock">In Stock / Disponible</option>
                            <option value="Out of Stock">Out of Stock / Agotado</option>
                            <option value="Coming Soon">Coming Soon / Próximamente</option>
                          </select>
                        </td>

                        {/* Discount */}
                        <td data-label="Volume/Bulk Discount Info">
                          <div 
                            contentEditable 
                            suppressContentEditableWarning
                            className="cell-editable"
                            onBlur={(e) => handleCellChange(p.id, 'discount', e.target.innerText)}
                          >
                            {p.discount}
                          </div>
                        </td>

                        {/* Image cell with Drag physical upload */}
                        <td data-label="Image URL / Physical Upload">
                          <div className="admin-image-cell">
                            <div className="admin-image-preview">
                              {p.imageUrl && p.imageUrl.startsWith('http') ? (
                                <img src={p.imageUrl} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                getCategoryIcon(p.category)
                              )}
                            </div>
                            <div 
                              contentEditable 
                              suppressContentEditableWarning
                              className="cell-editable"
                              style={{ flexGrow: 1, minWidth: '80px', maxWidth: '150px', fontSize: '0.7rem', color: '#94a3b8', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}
                              onBlur={(e) => handleCellChange(p.id, 'imageUrl', e.target.innerText)}
                              title={p.imageUrl}
                            >
                              {p.imageUrl}
                            </div>
                            <input 
                              type="file"
                              accept="image/*"
                              style={{ display: 'none' }}
                              id={`imageUpload-${p.id}`}
                              onChange={(e) => handleImageCellUpload(p.id, e)}
                            />
                            <button 
                              className="admin-image-upload-btn"
                              title="Upload picture"
                              onClick={() => document.getElementById(`imageUpload-${p.id}`).click()}
                            >
                              <Upload size={12} />
                            </button>
                          </div>
                        </td>

                        {/* COA Link */}
                        <td data-label="COA URL Link">
                          <div 
                            contentEditable 
                            suppressContentEditableWarning
                            className="cell-editable"
                            style={{ minWidth: '80px', maxWidth: '150px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}
                            onBlur={(e) => handleCellChange(p.id, 'coa', e.target.innerText)}
                            title={p.coa}
                          >
                            {p.coa}
                          </div>
                        </td>

                        {/* Info/Blog description edit button */}
                        <td data-label="Info/Blog" style={{ textAlign: 'center' }}>
                          <button
                            className="admin-btn"
                            style={{ padding: '4px 8px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '4px', margin: '0 auto' }}
                            onClick={() => {
                              setEditDescProduct(p);
                              setEditDescEn(p.descriptionEn || '');
                              setEditDescEs(p.descriptionEs || '');
                              setEditDescModalOpen(true);
                            }}
                          >
                            <FileText size={12} />
                            <span>Edit Info</span>
                          </button>
                        </td>

                        {/* Actions */}
                        <td data-label="Action" style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                            <button
                              className="admin-move-btn"
                              title="Move Up"
                              onClick={() => handleMoveRow(idx, -1)}
                              disabled={idx === 0}
                              style={{ opacity: idx === 0 ? 0.25 : 1 }}
                            >
                              <ChevronUp size={14} />
                            </button>
                            <button
                              className="admin-move-btn"
                              title="Move Down"
                              onClick={() => handleMoveRow(idx, 1)}
                              disabled={idx === products.length - 1}
                              style={{ opacity: idx === products.length - 1 ? 0.25 : 1 }}
                            >
                              <ChevronDown size={14} />
                            </button>
                            <button className="admin-delete-btn" onClick={() => handleDeleteRow(p.id)}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: ORDERS LEDGER HISTORY */}
        {activeTab === 'orders' && (
          <div>
            <div className="admin-toolbar" style={{ flexWrap: 'wrap', gap: '16px' }}>
              <div style={{ flex: '1 1 auto', minWidth: '300px' }}>
                <h3>Customer Orders Log Ledger</h3>
                <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '4px 0 12px 0' }}>
                  A secure listing of all catalog order intents placed by customers. Double check entries here before coordinating dispatches on WhatsApp.
                </p>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input 
                    type="text" 
                    placeholder="Search by name, phone, email, or tracking..." 
                    value={orderSearch}
                    onChange={(e) => setOrderSearch(e.target.value)}
                    style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'white', fontSize: '0.85rem', minWidth: '250px' }}
                  />
                  <select
                    value={orderStatusFilter}
                    onChange={(e) => setOrderStatusFilter(e.target.value)}
                    style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'white', fontSize: '0.85rem' }}
                  >
                    <option value="All">All Statuses</option>
                    <option value="Pending">Pending</option>
                    <option value="Paid">Paid</option>
                    <option value="Completed">Completed</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>
              </div>
              {orders.length > 0 && (
                <button
                  className="admin-btn admin-btn-primary"
                  onClick={() => setExportModalType('orders')}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, alignSelf: 'flex-start' }}
                >
                  <Upload size={14} />
                  Export Data
                </button>
              )}
            </div>

            {loadingOrders ? (
              <div className="loader">
                <div className="sync-spinner" style={{ marginBottom: '16px' }}></div>
                <div>Fetching logs from database...</div>
              </div>
            ) : orders.length === 0 ? (
              <div className="loader" style={{ background: '#0e1626', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                <Database size={32} style={{ margin: '0 auto 16px auto', opacity: 0.3, display: 'block' }} />
                No orders registered in the system yet.
              </div>
            ) : (
              <div className="orders-grid">
                {orders
                  .filter(o => {
                    if (orderStatusFilter !== 'All' && o.status !== orderStatusFilter) return false;
                    if (orderSearch) {
                      const s = orderSearch.toLowerCase();
                      return (
                        o.customer_name?.toLowerCase().includes(s) || 
                        o.customer_phone?.toLowerCase().includes(s) ||
                        o.customer_email?.toLowerCase().includes(s) ||
                        o.id?.toLowerCase().includes(s) ||
                        o.tracking_number?.toLowerCase().includes(s)
                      );
                    }
                    return true;
                  })
                  .map(order => {
                  const items = Array.isArray(order.items) ? order.items : [];
                  const orderDate = new Date(order.created_at).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' });
                  
                  return (
                    <div key={order.id} className="order-card">
                      <div className="order-card-header">
                        <div className="order-customer-info">
                          <h4>{order.customer_name}</h4>
                          {order.order_number && <p style={{ color: '#fbbf24', fontSize: '0.85rem', fontWeight: 600, marginTop: '2px' }}>Order #: {order.order_number}</p>}
                          <p>WhatsApp: {order.customer_phone}</p>
                          {order.customer_email && <p>Email: {order.customer_email}</p>}
                          {order.shipping_address && (
                            <p style={{ marginTop: '4px', fontSize: '0.85rem', color: '#94a3b8' }}>
                              <strong style={{ color: '#fff' }}>Address:</strong> {order.shipping_address}
                            </p>
                          )}
                          {(order.ip_address || order.location_data) && (
                            <div style={{ marginTop: '8px', padding: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', fontSize: '0.75rem', color: '#94a3b8' }}>
                              {order.location_data?.city && <div>📍 {order.location_data.city}, {order.location_data.country}</div>}
                              {order.ip_address && <div>🌐 IP: {order.ip_address}</div>}
                              {order.device_info && <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '250px' }} title={order.device_info}>💻 {order.device_info}</div>}
                            </div>
                          )}
                        </div>
                        <div className="order-meta-info">
                          <span className="order-date">{orderDate}</span>
                          <select 
                            className="cell-select"
                            value={order.status || 'Pending'}
                            onChange={(e) => handleOrderStatusUpdate(order.id, e.target.value)}
                            style={{
                              width: '120px',
                              background: order.status === 'Completed' ? 'rgba(34, 197, 94, 0.2)' : order.status === 'Paid' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                              color: order.status === 'Completed' ? '#4ade80' : order.status === 'Paid' ? '#38bdf8' : '#f59e0b',
                              fontWeight: 'bold',
                              border: 'none',
                              textAlign: 'center'
                            }}
                          >
                            <option value="Pending">Pending</option>
                            <option value="Paid">Paid</option>
                            <option value="Completed">Completed</option>
                            <option value="Cancelled">Cancelled</option>
                          </select>
                        </div>
                      </div>

                      <table className="order-items-table">
                        <thead>
                          <tr>
                            <th>Item Name</th>
                            <th style={{ width: '80px', textAlign: 'center' }}>Qty</th>
                            <th style={{ width: '120px', textAlign: 'right' }}>Price Each</th>
                            <th style={{ width: '140px', textAlign: 'right' }}>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((item, i) => (
                            <tr key={i}>
                              <td>{item.product}</td>
                              <td style={{ textAlign: 'center' }}>x{item.qty}</td>
                              <td style={{ textAlign: 'right' }}>
                                {order.currency === 'USD' ? `$${item.price}` : `₡${item.price.toLocaleString('en-US')}`}
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                                {order.currency === 'USD' ? `$${item.price * item.qty}` : `₡${(item.price * item.qty).toLocaleString('en-US')}`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <div className="order-card-footer">
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                          <span className="order-total-lbl">Revenues:</span>
                          <span className="order-total-val">
                            {order.currency === 'USD' 
                              ? `$${order.total_usd}` 
                              : `₡${order.total_crc.toLocaleString('en-US')}`
                            }
                          </span>
                          <span style={{ marginLeft: '12px', fontSize: '0.75rem', fontWeight: 'bold', padding: '4px 8px', borderRadius: '12px', background: 'rgba(255,255,255,0.1)', color: '#94a3b8' }}>
                            {order.payment_method === 'paypal' ? '💳 PayPal' : order.payment_method === 'sinpe' ? '📱 SINPE · Tilopay' : order.payment_method === 'tilopay' ? '💳 Tilopay Card' : '💬 WhatsApp'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                          {/* Tracking Number Input */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Tracking:</span>
                            <input 
                              type="text" 
                              placeholder="Add tracking #" 
                              defaultValue={order.tracking_number || ''}
                              onBlur={(e) => {
                                if (e.target.value !== order.tracking_number) {
                                  handleOrderTrackingUpdate(order.id, e.target.value);
                                }
                              }}
                              style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '0.8rem', outline: 'none', width: '120px' }}
                            />
                          </div>
                          
                          {/* WhatsApp direct contact link */}
                          <a 
                            href={`https://wa.me/${order.customer_phone.replace(/[^0-9]/g, '')}`} 
                            target="_blank" 
                            rel="noreferrer"
                            className="admin-btn"
                            style={{ background: 'rgba(34, 197, 94, 0.1)', borderColor: 'rgba(34, 197, 94, 0.2)', color: '#4ade80' }}
                          >
                            <MessageSquare size={14} />
                            WhatsApp
                          </a>
                          {/* Delete order */}
                          <button
                            className="admin-btn"
                            onClick={() => handleDeleteOrder(order.id)}
                            style={{ background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.2)', color: '#f87171' }}
                          >
                            <Trash2 size={14} />
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: SHARE LINKS GENERATOR */}
        {activeTab === 'share' && (
          <div>
            <div className="admin-toolbar">
              <div>
                <h3>Share Catalog Overrides Links</h3>
                <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '4px' }}>
                  Generate custom pre-configured links for different user groups (such as English speakers or currency preferences) to share directly in WhatsApp or bio pages.
                </p>
              </div>
            </div>

            <div className="order-card" style={{ maxWidth: '600px', margin: '0 auto' }}>
              <div className="share-link-builder">
                <div className="share-select-row">
                  <div className="filter-group">
                    <label style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: '800' }}>Preselected Language</label>
                    <select 
                      className="cell-select" 
                      value={shareLang}
                      onChange={(e) => setShareLang(e.target.value)}
                    >
                      <option value="es">Spanish / Español</option>
                      <option value="en">English / Inglés</option>
                    </select>
                  </div>
                  <div className="filter-group">
                    <label style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: '800' }}>Preselected Currency</label>
                    <select 
                      className="cell-select" 
                      value={shareCurrency}
                      onChange={(e) => setShareCurrency(e.target.value)}
                    >
                      <option value="CRC">CRC / Colones Costarricenses</option>
                      <option value="USD">USD / Dólares Estadounidenses</option>
                    </select>
                  </div>
                </div>

                <div style={{ marginTop: '12px' }}>
                  <label style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: '800', display: 'block', marginBottom: '8px' }}>Your Customized Share URL</label>
                  <div className="share-copy-wrapper">
                    <div className="share-url-box">{getShareUrl()}</div>
                    <button 
                      className="admin-btn admin-btn-primary" 
                      onClick={handleCopyLink}
                      style={{ padding: '0 16px', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                      {shareCopied ? <Check size={16} /> : <Share2 size={16} />}
                      {shareCopied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>

                <div style={{ background: 'rgba(0, 212, 255, 0.05)', border: '1px solid rgba(0, 212, 255, 0.1)', padding: '16px', borderRadius: '8px', fontSize: '0.8rem', color: '#cbd5e1', lineHeight: '1.5', marginTop: '16px' }}>
                  💡 **Sharing Pro-Tip:** Placing `lang=en` inside links will automatically translate all category names, buttons, and stock badges to English, and toggle the catalog to prioritize USD pricing immediately for international clients!
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'abandoned' && (
          <div className="admin-orders-tab">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
              <h2 style={{ fontSize: '1.25rem', color: '#f8fafc', margin: 0 }}>🛒 Active / Abandoned Carts</h2>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {abandonedCarts.length > 0 && (
                  <>
                    <button
                      onClick={() => setExportModalType('carts')}
                      style={{ padding: '6px 14px', fontSize: '0.85rem', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.2)', color: '#38bdf8', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '5px' }}
                    >
                      <Upload size={13} /> Export Data
                    </button>
                    <button
                      onClick={handleClearAllCarts}
                      style={{ padding: '6px 14px', fontSize: '0.85rem', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '5px' }}
                    >
                      <Trash2 size={13} /> Clear All
                    </button>
                  </>
                )}
                <button className="admin-btn" onClick={loadAdminData} style={{ padding: '6px 14px', fontSize: '0.85rem', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.2)', color: '#38bdf8', borderRadius: '8px', cursor: 'pointer', fontWeight: '700' }}>
                  Refresh
                </button>
              </div>
            </div>
            
            {loadingAbandonedCarts ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading carts...</div>
            ) : abandonedCarts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', background: '#0e1626', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', color: '#94a3b8' }}>
                No active or abandoned carts currently.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {abandonedCarts.map(acart => (
                  <div key={acart.session_id} style={{ background: '#0e1626', padding: '20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', boxShadow: '0 4px 6px rgba(0,0,0,0.2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                      <div>
                        <h3 style={{ margin: '0 0 4px 0', fontSize: '1rem', color: '#f8fafc' }}>{acart.customer_name || 'Anonymous User'}</h3>
                        <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                          Phone: {acart.customer_phone || 'Not provided'}
                          {acart.customer_email && <div>Email: {acart.customer_email}</div>}
                        </div>
                        
                        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                          {acart.customer_email && (
                            <button
                              onClick={() => handleSendRecoveryEmail(acart)}
                              disabled={sendingRecoveryEmail[acart.session_id]}
                              style={{
                                padding: '6px 12px',
                                fontSize: '0.75rem',
                                background: acart.recovery_email_sent ? 'rgba(56, 189, 248, 0.1)' : 'rgba(16, 185, 129, 0.15)',
                                border: acart.recovery_email_sent ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)',
                                color: acart.recovery_email_sent ? '#38bdf8' : '#34d399',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontWeight: '700',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                              }}
                            >
                              <Mail size={13} />
                              {sendingRecoveryEmail[acart.session_id] ? 'Sending...' : acart.recovery_email_sent ? 'Recovery email already sent' : 'Send Recovery Email'}
                            </button>
                          )}
                          
                          {acart.customer_phone && (
                            <a
                              href={`https://wa.me/${acart.customer_phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                                acart.lang === 'en'
                                  ? `Hi ${acart.customer_name || ''}, we saved your cart at Peptides Costa Rica! Let us know if you have any questions or need help completing your order.`
                                  : `Hola ${acart.customer_name || ''}, ¡guardamos tu carrito en Péptidos Costa Rica! Escríbenos si tienes dudas o necesitas ayuda para completar tu compra.`
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                padding: '6px 12px',
                                fontSize: '0.75rem',
                                background: 'rgba(34, 197, 94, 0.15)',
                                border: '1px solid rgba(34, 197, 94, 0.3)',
                                color: '#4ade80',
                                borderRadius: '8px',
                                textDecoration: 'none',
                                fontWeight: '700',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px'
                              }}
                            >
                              <MessageCircle size={13} />
                              Contact via WhatsApp
                            </a>
                          )}
                        </div>

                        {(acart.ip_address || acart.location_data) && (
                          <div style={{ marginTop: '12px', padding: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', fontSize: '0.75rem', color: '#94a3b8' }}>
                            {acart.location_data?.city && <div>📍 {acart.location_data.city}, {acart.location_data.country}</div>}
                            {acart.ip_address && <div>🌐 IP: {acart.ip_address}</div>}
                            {acart.device_info && <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '250px' }} title={acart.device_info}>💻 {acart.device_info}</div>}
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                        <div style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', padding: '4px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 'bold', display: 'inline-block' }}>Active Cart</div>
                        
                        {acart.recovery_email_sent ? (
                          <div style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', padding: '4px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 'bold', display: 'inline-block' }} title={acart.recovery_email_sent_at ? `Sent at: ${new Date(acart.recovery_email_sent_at).toLocaleString()}` : ''}>
                            ✉️ Recovery Email Sent
                          </div>
                        ) : (
                          <div style={{ background: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8', padding: '4px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 'bold', display: 'inline-block' }}>
                            ✉️ Recovery Never Sent
                          </div>
                        )}

                        <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                          Last Updated: {new Date(acart.last_updated).toLocaleString()}
                        </div>
                        <button
                          onClick={() => handleDeleteCart(acart.session_id)}
                          title="Delete this cart entry"
                          style={{ marginTop: '4px', padding: '5px 10px', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.25)', color: '#f87171', borderRadius: '7px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    </div>
                    
                    <h4 style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '8px' }}>Items in Cart:</h4>
                    <div style={{ background: '#172237', padding: '12px', borderRadius: '8px' }}>
                      {acart.cart_data.map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: idx < acart.cart_data.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', color: '#f8fafc' }}>
                          <span>{item.product}</span>
                          <span style={{ fontWeight: 'bold', color: '#38bdf8' }}>x{item.qty}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB: REVIEWS MODERATION */}
        {activeTab === 'reviews' && (
          <div className="admin-orders-tab">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
              <h2 style={{ fontSize: '1.25rem', color: '#f8fafc', margin: 0 }}>⭐ Product Reviews Moderation</h2>
              <button className="admin-btn" onClick={loadAdminData} style={{ padding: '6px 14px', fontSize: '0.85rem', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.2)', color: '#38bdf8', borderRadius: '8px', cursor: 'pointer', fontWeight: '700' }}>
                Refresh
              </button>
            </div>
            
            {loadingReviews ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading reviews...</div>
            ) : reviews.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', background: '#0e1626', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', color: '#94a3b8' }}>
                No reviews found.
              </div>
            ) : (
              <div className="spreadsheet-container">
                <table className="spreadsheet-table">
                  <thead>
                    <tr>
                      <th style={{ width: '100px' }}>Date</th>
                      <th style={{ width: '180px' }}>Product</th>
                      <th style={{ width: '150px' }}>Author</th>
                      <th style={{ width: '100px', textAlign: 'center' }}>Rating</th>
                      <th style={{ minWidth: '300px' }}>Review Comment</th>
                      <th style={{ width: '90px', textAlign: 'center' }}>Status</th>
                      <th style={{ width: '160px', textAlign: 'center' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviews.map(r => (
                      <tr key={r.id} style={{ opacity: r.status === 'Approved' ? 0.75 : 1 }}>
                        <td style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                          {new Date(r.created_at).toLocaleDateString()}
                        </td>
                        <td style={{ fontWeight: 'bold' }}>{r.product_name}</td>
                        <td>{r.customer_name}</td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '2px', justifyContent: 'center' }}>
                            {[1, 2, 3, 4, 5].map(star => (
                              <Star key={star} size={12} fill={star <= r.rating ? '#fbbf24' : 'transparent'} color="#fbbf24" />
                            ))}
                          </div>
                        </td>
                        <td style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
                           <div style={{ maxHeight: '60px', overflowY: 'auto', paddingRight: '4px', lineHeight: '1.4' }}>
                             {r.comment}
                           </div>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ 
                            background: r.status === 'Approved' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(59, 130, 246, 0.15)', 
                            color: r.status === 'Approved' ? '#4ade80' : '#38bdf8', 
                            padding: '4px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 'bold' 
                          }}>
                            {r.status}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                            {r.status !== 'Approved' && (
                              <button onClick={() => handleApproveReview(r.id)} style={{ padding: '6px 10px', background: 'rgba(22, 163, 74, 0.15)', color: '#4ade80', border: '1px solid rgba(22, 163, 74, 0.3)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                Approve
                              </button>
                            )}
                            <button onClick={() => handleDeleteReview(r.id)} style={{ padding: '6px 10px', background: 'rgba(220, 38, 38, 0.15)', color: '#f87171', border: '1px solid rgba(220, 38, 38, 0.3)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}>
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB: CMS */}
        {activeTab === 'cms' && (
          <div className="admin-orders-tab">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
              <h2 style={{ fontSize: '1.25rem', color: '#f8fafc', margin: 0 }}><FileText size={20} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'text-bottom', color: '#38bdf8' }} /> Content Management System</h2>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button className="admin-btn" onClick={loadAdminData} style={{ padding: '6px 14px', fontSize: '0.85rem', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.2)', color: '#38bdf8', borderRadius: '8px', cursor: 'pointer', fontWeight: '700' }}>
                  Refresh
                </button>
              </div>
            </div>

            {cmsSaveStatus && (
              <div style={{ 
                padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.8rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px',
                background: cmsSaveStatus.startsWith('error') ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                border: `1px solid ${cmsSaveStatus.startsWith('error') ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)'}`,
                color: cmsSaveStatus.startsWith('error') ? '#f87171' : '#4ade80'
              }}>
                {cmsSaveStatus.startsWith('error') ? <AlertCircle size={16} /> : <Check size={16} />}
                {cmsSaveStatus.replace(/^(error:|success:)/, '')}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
              
              {/* Landing Page Settings */}
              <div style={{ background: '#0e1626', padding: '24px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <h3 style={{ fontSize: '1.1rem', color: '#f8fafc', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Zap size={18} color="#f59e0b" /> Landing Page Controls
                </h3>
                
                {loadingSettings ? (
                  <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Loading settings...</div>
                ) : siteSettings ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    
                    {/* Announcement Banner */}
                    <div style={{ background: '#172237', padding: '16px', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <h4 style={{ margin: 0, color: '#f8fafc', fontSize: '0.95rem' }}>Announcement Banner</h4>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                          <input type="checkbox" checked={siteSettings.bannerActive} onChange={e => setSiteSettings({...siteSettings, bannerActive: e.target.checked})} />
                          <span style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>Enable Banner</span>
                        </label>
                      </div>
                      <input type="text" placeholder="Banner Text (EN)" value={siteSettings.bannerTextEn} onChange={e => setSiteSettings({...siteSettings, bannerTextEn: e.target.value})} style={{ width: '100%', padding: '8px', marginBottom: '8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: '#0e1626', color: '#f8fafc', fontSize: '0.85rem' }} />
                      <input type="text" placeholder="Banner Text (ES)" value={siteSettings.bannerTextEs} onChange={e => setSiteSettings({...siteSettings, bannerTextEs: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: '#0e1626', color: '#f8fafc', fontSize: '0.85rem' }} />
                    </div>

                    {/* Hero Text Controls */}
                    <div style={{ background: '#172237', padding: '16px', borderRadius: '8px' }}>
                      <h4 style={{ margin: '0 0 12px 0', color: '#f8fafc', fontSize: '0.95rem' }}>Hero Text (English)</h4>
                      <input type="text" placeholder="Hero Title" value={siteSettings.heroTitleEn} onChange={e => setSiteSettings({...siteSettings, heroTitleEn: e.target.value})} style={{ width: '100%', padding: '8px', marginBottom: '8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: '#0e1626', color: '#f8fafc', fontSize: '0.85rem' }} />
                      <input type="text" placeholder="Hero Subtitle" value={siteSettings.heroSubEn} onChange={e => setSiteSettings({...siteSettings, heroSubEn: e.target.value})} style={{ width: '100%', padding: '8px', marginBottom: '8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: '#0e1626', color: '#f8fafc', fontSize: '0.85rem' }} />
                      <textarea placeholder="Hero Description" value={siteSettings.heroTextEn} onChange={e => setSiteSettings({...siteSettings, heroTextEn: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: '#0e1626', color: '#f8fafc', fontSize: '0.85rem', minHeight: '60px' }} />
                    </div>

                    <div style={{ background: '#172237', padding: '16px', borderRadius: '8px' }}>
                      <h4 style={{ margin: '0 0 12px 0', color: '#f8fafc', fontSize: '0.95rem' }}>Hero Text (Español)</h4>
                      <input type="text" placeholder="Hero Title" value={siteSettings.heroTitleEs} onChange={e => setSiteSettings({...siteSettings, heroTitleEs: e.target.value})} style={{ width: '100%', padding: '8px', marginBottom: '8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: '#0e1626', color: '#f8fafc', fontSize: '0.85rem' }} />
                      <input type="text" placeholder="Hero Subtitle" value={siteSettings.heroSubEs} onChange={e => setSiteSettings({...siteSettings, heroSubEs: e.target.value})} style={{ width: '100%', padding: '8px', marginBottom: '8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: '#0e1626', color: '#f8fafc', fontSize: '0.85rem' }} />
                      <textarea placeholder="Hero Description" value={siteSettings.heroTextEs} onChange={e => setSiteSettings({...siteSettings, heroTextEs: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: '#0e1626', color: '#f8fafc', fontSize: '0.85rem', minHeight: '60px' }} />
                    </div>

                    <button onClick={handleSaveSiteSettings} disabled={cmsSaveLoading} className="admin-btn admin-btn-primary" style={{ padding: '12px', justifyContent: 'center' }}>
                      {cmsSaveLoading ? 'Saving...' : <><Save size={16} /> Save Landing Page Settings</>}
                    </button>
                  </div>
                ) : null}
              </div>

              {/* Blog Manager */}
              <div style={{ background: '#0e1626', padding: '24px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', gridColumn: '1 / -1' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h3 style={{ fontSize: '1.1rem', color: '#f8fafc', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <LayoutDashboard size={18} color="#10b981" /> Blog Post Manager
                  </h3>
                  <button className="admin-btn admin-btn-accent" onClick={() => setEditingBlog({ slug: '', title_en: '', title_es: '', excerpt_en: '', excerpt_es: '', content_en: '', content_es: '', image_url: '', published: false })}>
                    <Plus size={16} /> New Post
                  </button>
                </div>

                {loadingBlogs ? (
                   <div style={{ color: '#94a3b8' }}>Loading blogs...</div>
                ) : blogs.length === 0 ? (
                   <div style={{ color: '#64748b', fontSize: '0.9rem', fontStyle: 'italic' }}>No blog posts found. Create your first post!</div>
                ) : (
                   <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                     {blogs.map(b => (
                       <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#172237', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                         <div>
                           <div style={{ color: '#f8fafc', fontWeight: 'bold', fontSize: '0.95rem' }}>{b.title_en}</div>
                           <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>/{b.slug} &bull; {b.published ? <span style={{ color: '#4ade80' }}>Published</span> : <span style={{ color: '#f59e0b' }}>Draft</span>}</div>
                         </div>
                         <div style={{ display: 'flex', gap: '8px' }}>
                           <button onClick={() => setEditingBlog(b)} className="admin-btn" style={{ padding: '6px 10px', fontSize: '0.8rem' }}>Edit</button>
                           <button onClick={() => handleDeleteBlog(b.id)} className="admin-btn" style={{ padding: '6px 10px', fontSize: '0.8rem', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.2)' }}><Trash2 size={14}/></button>
                         </div>
                       </div>
                     ))}
                   </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB: ANALYTICS */}
        {activeTab === 'analytics' && (
          <div className="admin-orders-tab">
            <AnalyticsDashboard orders={orders} abandonedCarts={abandonedCarts} products={products} />
          </div>
        )}

        {/* TAB: CUSTOMERS CRM */}
        {activeTab === 'customers' && (
          <div className="admin-orders-tab" style={{ padding: '20px 0' }}>
            <CustomersCRM orders={orders} abandonedCarts={abandonedCarts} />
          </div>
        )}

        {/* TAB: LEADS */}
        {activeTab === 'leads' && (
          <div className="admin-orders-tab" style={{ padding: '20px 0' }}>
            <div className="section-header" style={{ padding: '0 24px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2>Catalog Access Leads</h2>
                <p>Users who provided their contact info to view the catalog.</p>
              </div>
              <button 
                className="admin-btn"
                onClick={() => setExportModalType('leads')}
                disabled={leads.length === 0}
                style={{ background: '#172237', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Upload size={16} /> Export Data
              </button>
            </div>
            
            {loadingLeads ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading leads...</div>
            ) : leads.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>No leads captured yet.</div>
            ) : (
              <div className="table-responsive" style={{ margin: '0 24px', background: '#0e1626', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}>
                <table className="spreadsheet-table">
                  <thead>
                    <tr>
                      <th style={{ padding: '16px' }}>Date</th>
                      <th style={{ padding: '16px' }}>Method</th>
                      <th style={{ padding: '16px' }}>Contact Info</th>
                      <th style={{ padding: '16px' }}>Language</th>
                      <th style={{ padding: '16px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map(lead => (
                      <tr key={lead.id}>
                        <td style={{ padding: '16px' }}>{new Date(lead.created_at).toLocaleString()}</td>
                        <td style={{ padding: '16px' }}>
                          {editingLeadId === lead.id ? (
                            <select 
                              value={editLeadMethod} 
                              onChange={(e) => setEditLeadMethod(e.target.value)}
                              className="admin-input"
                              style={{ width: '100px', padding: '6px 12px', height: 'auto', fontSize: '0.85rem' }}
                            >
                              <option value="whatsapp">whatsapp</option>
                              <option value="email">email</option>
                            </select>
                          ) : (
                            <span style={{ 
                              background: lead.contact_method === 'whatsapp' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(56, 189, 248, 0.15)', 
                              color: lead.contact_method === 'whatsapp' ? '#4ade80' : '#38bdf8', 
                              padding: '6px 12px', 
                              borderRadius: '20px', 
                              fontSize: '0.75rem', 
                              fontWeight: 'bold',
                              textTransform: 'uppercase',
                              display: 'inline-block',
                              border: lead.contact_method === 'whatsapp' ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(56, 189, 248, 0.3)'
                            }}>
                              {lead.contact_method}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '16px', fontWeight: 'bold' }}>
                          {editingLeadId === lead.id ? (
                            <input 
                              type="text" 
                              value={editLeadValue} 
                              onChange={(e) => setEditLeadValue(e.target.value)}
                              className="admin-input"
                              style={{ width: '100%', padding: '6px 12px', height: 'auto', fontSize: '0.85rem' }}
                            />
                          ) : (
                            lead.contact_value
                          )}
                        </td>
                        <td style={{ padding: '16px' }}>{lead.language.toUpperCase()}</td>
                        <td style={{ padding: '16px' }}>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            {editingLeadId === lead.id ? (
                              <button 
                                className="admin-btn" 
                                onClick={() => handleLeadUpdate(lead.id)}
                                style={{ padding: '6px 12px', fontSize: '0.8rem', background: '#3b82f6', color: '#fff', border: 'none' }}
                              >
                                Save
                              </button>
                            ) : (
                              <button 
                                className="admin-btn" 
                                onClick={() => {
                                  setEditingLeadId(lead.id);
                                  setEditLeadValue(lead.contact_value);
                                  setEditLeadMethod(lead.contact_method);
                                }}
                                style={{ padding: '6px 12px', fontSize: '0.8rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc' }}
                              >
                                Edit
                              </button>
                            )}
                            <button 
                              className="admin-btn" 
                              onClick={() => handleLeadDelete(lead.id)}
                              style={{ padding: '6px 12px', fontSize: '0.8rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444' }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Blog Editor Modal */}
      {editingBlog && (
        <div className="modal active" onClick={() => setEditingBlog(null)} style={{ zIndex: 200 }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px', width: '90%', maxHeight: '90vh', overflowY: 'auto', background: '#0e1626', color: '#f8fafc' }}>
            <button className="close-modal" onClick={() => setEditingBlog(null)} style={{ color: '#94a3b8' }}>&times;</button>
            <h2 style={{ fontSize: '1.3rem', fontWeight: '900', color: '#f8fafc', marginBottom: '20px' }}>{editingBlog.id ? 'Edit Blog Post' : 'New Blog Post'}</h2>
            
            <form onSubmit={handleSaveBlog} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Slug (URL path)</label>
                  <input required type="text" value={editingBlog.slug} onChange={e => setEditingBlog({...editingBlog, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-')})} placeholder="e.g. what-are-peptides" style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#172237', color: '#f8fafc', fontSize: '0.9rem', outline: 'none' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Cover Image URL</label>
                  <input type="text" value={editingBlog.image_url} onChange={e => setEditingBlog({...editingBlog, image_url: e.target.value})} placeholder="https://..." style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#172237', color: '#f8fafc', fontSize: '0.9rem', outline: 'none' }} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Title (EN)</label>
                  <input required type="text" value={editingBlog.title_en} onChange={e => setEditingBlog({...editingBlog, title_en: e.target.value})} style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#172237', color: '#f8fafc', fontSize: '0.9rem', outline: 'none' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Title (ES)</label>
                  <input required type="text" value={editingBlog.title_es} onChange={e => setEditingBlog({...editingBlog, title_es: e.target.value})} style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#172237', color: '#f8fafc', fontSize: '0.9rem', outline: 'none' }} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Excerpt (EN)</label>
                  <textarea required value={editingBlog.excerpt_en} onChange={e => setEditingBlog({...editingBlog, excerpt_en: e.target.value})} style={{ width: '100%', height: '80px', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#172237', color: '#f8fafc', fontSize: '0.9rem', outline: 'none', resize: 'vertical' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Excerpt (ES)</label>
                  <textarea required value={editingBlog.excerpt_es} onChange={e => setEditingBlog({...editingBlog, excerpt_es: e.target.value})} style={{ width: '100%', height: '80px', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#172237', color: '#f8fafc', fontSize: '0.9rem', outline: 'none', resize: 'vertical' }} />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Content (EN) - HTML/Markdown</label>
                <textarea required value={editingBlog.content_en} onChange={e => setEditingBlog({...editingBlog, content_en: e.target.value})} style={{ width: '100%', height: '200px', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#172237', color: '#f8fafc', fontSize: '0.9rem', outline: 'none', resize: 'vertical' }} />
              </div>
              
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Content (ES) - HTML/Markdown</label>
                <textarea required value={editingBlog.content_es} onChange={e => setEditingBlog({...editingBlog, content_es: e.target.value})} style={{ width: '100%', height: '200px', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#172237', color: '#f8fafc', fontSize: '0.9rem', outline: 'none', resize: 'vertical' }} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', padding: '10px 16px', borderRadius: '8px' }}>
                  <input type="checkbox" checked={editingBlog.published} onChange={e => setEditingBlog({...editingBlog, published: e.target.checked})} style={{ transform: 'scale(1.2)' }} />
                  <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: editingBlog.published ? '#4ade80' : '#94a3b8' }}>
                    {editingBlog.published ? 'Published (Live)' : 'Draft (Hidden)'}
                  </span>
                </label>
                
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button type="button" className="admin-btn" onClick={() => setEditingBlog(null)}>Cancel</button>
                  <button type="submit" disabled={cmsSaveLoading} className="admin-btn admin-btn-primary">
                    {cmsSaveLoading ? 'Saving...' : <><Save size={16} /> Save Blog Post</>}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}      {/* Change Password Modal */}
      {showPasswordModal && (
        <div className="modal active" onClick={() => setShowPasswordModal(false)} style={{ zIndex: 200 }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px', background: '#0e1626', color: '#f8fafc' }}>
            <button className="close-modal" onClick={() => setShowPasswordModal(false)} style={{ color: '#94a3b8' }}>&times;</button>
            
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <KeyRound size={36} style={{ color: '#38bdf8', marginBottom: '12px' }} />
              <h2 style={{ fontSize: '1.3rem', fontWeight: '900', color: '#f8fafc' }}>Change Password</h2>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '6px' }}>Update your admin access password</p>
            </div>

            {passwordStatus && (
              <div style={{ 
                padding: '10px 14px', 
                borderRadius: '8px', 
                marginBottom: '16px',
                fontSize: '0.8rem',
                fontWeight: '700',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: passwordStatus.startsWith('error') ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                border: `1px solid ${passwordStatus.startsWith('error') ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)'}`,
                color: passwordStatus.startsWith('error') ? '#f87171' : '#4ade80'
              }}>
                {passwordStatus.startsWith('error') ? <AlertCircle size={16} /> : <Check size={16} />}
                {passwordStatus.replace(/^(error:|success:)/, '')}
              </div>
            )}

            <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>Current Password</label>
                <input 
                  type="password" 
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#172237', color: '#f8fafc', fontSize: '0.9rem', outline: 'none' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>New Password</label>
                <input 
                  type="password" 
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#172237', color: '#f8fafc', fontSize: '0.9rem', outline: 'none' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>Confirm New Password</label>
                <input 
                  type="password" 
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#172237', color: '#f8fafc', fontSize: '0.9rem', outline: 'none' }}
                />
              </div>
              <button 
                type="submit" 
                disabled={passwordLoading}
                style={{ width: '100%', padding: '12px', borderRadius: '10px', border: 'none', background: '#38bdf8', color: '#050b18', fontWeight: '800', fontSize: '0.9rem', cursor: 'pointer', marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                {passwordLoading ? (
                  <div className="sync-spinner" style={{ width: '16px', height: '16px' }}></div>
                ) : (
                  <><KeyRound size={16} /> Update Password</>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Description Modal */}
      {editDescModalOpen && editDescProduct && (
        <div className="modal active" onClick={() => setEditDescModalOpen(false)} style={{ zIndex: 200 }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px', background: '#0e1626', color: '#f8fafc' }}>
            <button className="close-modal" onClick={() => setEditDescModalOpen(false)} style={{ color: '#94a3b8' }}>&times;</button>
            
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <FileText size={36} style={{ color: '#38bdf8', marginBottom: '8px' }} />
              <h2 style={{ fontSize: '1.3rem', fontWeight: '900', color: '#f8fafc' }}>Edit Product Information / Blog</h2>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '4px' }}>{editDescProduct.product}</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>
                  English Description / Information
                </label>
                <textarea
                  value={editDescEn}
                  onChange={(e) => setEditDescEn(e.target.value)}
                  placeholder="Enter detailed scientific info, uses, benefits, and research details in English..."
                  style={{ width: '100%', height: '120px', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#172237', color: '#f8fafc', fontSize: '0.9rem', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>
                  Spanish Description / Información (Español)
                </label>
                <textarea
                  value={editDescEs}
                  onChange={(e) => setEditDescEs(e.target.value)}
                  placeholder="Ingrese información científica detallada, usos, beneficios y detalles de investigación en español..."
                  style={{ width: '100%', height: '120px', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#172237', color: '#f8fafc', fontSize: '0.9rem', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button
                  className="admin-btn"
                  onClick={() => setEditDescModalOpen(false)}
                  style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }}
                >
                  Cancel
                </button>
                <button
                  className="admin-btn admin-btn-primary"
                  onClick={() => {
                    handleCellChange(editDescProduct.id, 'descriptionEn', editDescEn);
                    handleCellChange(editDescProduct.id, 'descriptionEs', editDescEs);
                    setEditDescModalOpen(false);
                  }}
                >
                  Apply & Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reusable Export Modal */}
      <ExportModal 
        isOpen={!!exportModalType}
        onClose={() => setExportModalType(null)}
        title={
          exportModalType === 'orders' ? 'Export Orders' : 
          exportModalType === 'products' ? 'Export Products' : 
          exportModalType === 'carts' ? 'Export Carts' : 
          exportModalType === 'leads' ? 'Export Leads' : 'Export Data'
        }
        description={`Choose a format to download all ${exportModalType || ''} data.`}
        loading={exportLoading}
        onExportCSV={() => handleExport('csv')}
        onExportXLSX={() => handleExport('xlsx')}
        onExportPDF={() => handleExport('pdf')}
      />
    </div>
  );
}
