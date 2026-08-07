// @ts-nocheck
import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../db/database';
import { formatCurrency, showToast, playSound, vibrateDevice, menuItemImageSource } from '../../utils/helpers';
import { compressImage, formatBytes } from '../../utils/imageProcessing';

import { itemArt } from '../../content/categoryArt';
/** Cloud `menu_items.image_url` is a varchar(500); anything longer must stay local. */
const MAX_REMOTE_IMAGE_URL_LENGTH = 500;

interface Category {
  id?: number;
  name: string;
  sortOrder: number;
  isActive: number;
  icon?: string;
  isSynced?: number;
}

interface MenuItem {
  id?: number;
  name: string;
  categoryId: number;
  price: number;
  isVeg: number;
  isAvailable: number;
  sortOrder: number;
  imageUrl?: string;
  imageData?: string;
  isSynced?: number;
}

export function MenuManager() {
  const [activeTab, setActiveTab] = useState<'items' | 'categories'>('items');
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [dietFilter, setDietFilter] = useState<'all' | 'veg' | 'nonveg'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'soldout'>('all');
  const [selectedCatFilter, setSelectedCatFilter] = useState<number | 'all'>('all');

  // Modal states
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [imageUploading, setImageUploading] = useState(false);

  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const catsList = await db.menuCategories.orderBy('sortOrder').toArray();
      const itemsList = await db.menuItems.orderBy('sortOrder').toArray();
      setCategories(catsList);
      setItems(itemsList);
    } catch (err) {
      console.error('Failed to load menu CRUD data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleTabChange = (tab: 'items' | 'categories') => {
    playSound(700, 80);
    setActiveTab(tab);
  };

  // --- ITEM CRUD ACTIONS ---
  const handleAddItemClick = () => {
    playSound(800, 100);
    setEditingItem({
      name: '',
      categoryId: categories[0]?.id || 0,
      price: 100,
      isVeg: 1,
      isAvailable: 1,
      sortOrder: items.length + 1
    });
    setItemModalOpen(true);
  };

  const handleEditItemClick = (item: MenuItem) => {
    playSound(800, 100);
    setEditingItem({ ...item });
    setItemModalOpen(true);
  };

  const handleDeleteItemClick = async (id: number) => {
    playSound(300, 150, 'sawtooth');
    if (confirm('Are you sure you want to delete this menu item?')) {
      await db.menuItems.delete(id);
      showToast('Item deleted successfully', 'success');
      loadData();
    }
  };

  const handleToggleAvailable = async (item: MenuItem) => {
    playSound(700, 80);
    const updatedStatus = item.isAvailable === 1 ? 0 : 1;
    await db.menuItems.update(item.id!, { isAvailable: updatedStatus, isSynced: 0 });
    showToast(updatedStatus === 1 ? `${item.name} is Available` : `${item.name} is Sold Out`, 'info');
    loadData();
  };

  /**
   * Push an already-optimised image to the shared bucket.
   *
   * Storage writes are gated by RLS on an active cloud manager session, so a
   * PIN-only or offline shift legitimately cannot upload. That is reported as
   * a reason rather than an error: the caller keeps the picture on the device.
   */
  const uploadItemImageToCloud = async (optimised: any) => {
    try {
      const { getSupabaseClient } = await import('../../services/supabaseClient');
      const supabase = await getSupabaseClient();
      if (!supabase) {
        return { url: '', reason: 'Cloud storage is not configured on this device.' };
      }

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) {
        return { url: '', reason: 'Sign in with your cloud manager account to publish it to all devices.' };
      }

      const extByType: Record<string, string> = {
        'image/png': 'png',
        'image/webp': 'webp',
        'image/svg+xml': 'svg'
      };
      const fileExt = extByType[optimised.type] || 'jpg';
      // The storage policy only accepts writes under `items/`.
      const filePath = `items/${Date.now()}_${Math.random().toString(36).slice(2, 11)}.${fileExt}`;

      const { error } = await supabase.storage
        .from('menu-images')
        .upload(filePath, optimised.blob, {
          cacheControl: '3600',
          upsert: true,
          contentType: optimised.type
        });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('menu-images')
        .getPublicUrl(filePath);

      const publicUrl = String(urlData?.publicUrl || '');
      if (!publicUrl) {
        return { url: '', reason: 'Cloud storage did not return a public link.' };
      }
      return { url: publicUrl, reason: '' };
    } catch (err: any) {
      const message = err?.message || String(err);
      console.error('Cloud image upload failed:', err);
      const denied = /row-level security|not authoriz|unauthoriz|permission|policy|403/i.test(message);
      return {
        url: '',
        reason: denied
          ? 'Cloud upload was refused — a manager/owner cloud login is required.'
          : `Cloud upload failed: ${message}`
      };
    }
  };

  const handleItemImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file || !editingItem) return;

    setImageUploading(true);
    try {
      // Any camera-sized photo is accepted: it is downscaled here instead of
      // being rejected for its file size.
      const optimised = await compressImage(file, { maxDimension: 1280, maxBytes: 400 * 1024 });

      // Show the new picture straight away, whether or not the cloud accepts it.
      setEditingItem(prev => prev ? { ...prev, imageData: optimised.dataUrl } : null);

      const { url, reason } = await uploadItemImageToCloud(optimised);
      if (url) {
        setEditingItem(prev => prev ? { ...prev, imageUrl: url, imageData: '' } : null);
        showToast(
          `Image optimised ${formatBytes(optimised.originalBytes)} → ${formatBytes(optimised.bytes)} and uploaded. Save to apply.`,
          'success'
        );
      } else {
        showToast(`${reason} Image saved on this device only. Save to apply.`, 'warning');
      }
    } catch (err: any) {
      console.error('Image processing failed:', err);
      showToast(`Could not use this image: ${err?.message || err}`, 'error');
    } finally {
      setImageUploading(false);
      input.value = '';
    }
  };

  const handleImageUrlChange = (value: string) => {
    const url = value.trim();
    setEditingItem(prev => prev ? { ...prev, imageUrl: url, imageData: url ? '' : prev.imageData } : null);
  };

  const handleRemoveItemImage = () => {
    playSound(400, 80);
    setEditingItem(prev => prev ? { ...prev, imageUrl: '', imageData: '' } : null);
    showToast('Image cleared — the category default will be shown. Save to apply.', 'info');
  };

  const handleSaveItem = async () => {
    if (!editingItem) return;
    const name = editingItem.name.trim();

    if (!name) {
      showToast('Please enter an item name', 'warning');
      return;
    }

    // A pasted data URL (or an over-long link) cannot fit the cloud's
    // varchar(500) `image_url`, so it is kept as a device-local image instead
    // of silently breaking the next menu sync.
    const rawUrl = String(editingItem.imageUrl || '').trim();
    const urlIsRemoteSafe = rawUrl.length <= MAX_REMOTE_IMAGE_URL_LENGTH && !/^data:/i.test(rawUrl);

    const savedItem = {
      ...editingItem,
      imageUrl: urlIsRemoteSafe ? rawUrl : '',
      imageData: urlIsRemoteSafe
        ? String(editingItem.imageData || '')
        : (String(editingItem.imageData || '') || rawUrl),
      name,
      categoryId: Number(editingItem.categoryId),
      price: Number(editingItem.price) || 0,
      isVeg: Number(editingItem.isVeg),
      isAvailable: Number(editingItem.isAvailable),
      sortOrder: Number(editingItem.sortOrder) || 0,
      isSynced: 0
    };

    if (!savedItem.id) {
      await db.menuItems.add(savedItem);
      showToast('Item created successfully!', 'success');
    } else {
      await db.menuItems.put(savedItem);
      showToast('Item updated successfully!', 'success');
    }

    setItemModalOpen(false);
    setEditingItem(null);
    playSound(800, 100);
    vibrateDevice([40]);
    loadData();
  };

  // --- CATEGORY CRUD ACTIONS ---
  const handleAddCategoryClick = () => {
    playSound(800, 100);
    setEditingCategory({
      name: '',
      sortOrder: categories.length + 1,
      isActive: 1
    });
    setCategoryModalOpen(true);
  };

  const handleEditCategoryClick = (cat: Category) => {
    playSound(800, 100);
    setEditingCategory({ ...cat });
    setCategoryModalOpen(true);
  };

  const handleDeleteCategoryClick = async (id: number) => {
    playSound(300, 150, 'sawtooth');
    if (confirm('Deleting this category will NOT delete the menu items but they might not be visible. Are you sure you want to delete?')) {
      await db.menuCategories.delete(id);
      showToast('Category deleted successfully', 'success');
      loadData();
    }
  };

  const handleSaveCategory = async () => {
    if (!editingCategory) return;
    const name = editingCategory.name.trim();

    if (!name) {
      showToast('Please enter category name', 'warning');
      return;
    }

    const savedCategory = {
      ...editingCategory,
      name,
      sortOrder: Number(editingCategory.sortOrder) || 0,
      isActive: Number(editingCategory.isActive),
      isSynced: 0
    };

    if (!savedCategory.id) {
      await db.menuCategories.add(savedCategory);
      showToast('Category created!', 'success');
    } else {
      await db.menuCategories.put(savedCategory);
      showToast('Category updated!', 'success');
    }

    setCategoryModalOpen(false);
    setEditingCategory(null);
    playSound(800, 100);
    vibrateDevice([40]);
    loadData();
  };


  // Filter items logic
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase().trim());
      const matchDiet = dietFilter === 'all' 
        ? true 
        : (dietFilter === 'veg' ? item.isVeg === 1 : item.isVeg === 0);
      const matchStatus = statusFilter === 'all'
        ? true
        : (statusFilter === 'available' ? item.isAvailable === 1 : item.isAvailable === 0);
      const matchCat = selectedCatFilter === 'all'
        ? true
        : item.categoryId === Number(selectedCatFilter);

      return matchSearch && matchDiet && matchStatus && matchCat;
    });
  }, [items, searchQuery, dietFilter, statusFilter, selectedCatFilter]);

  // Compute number of items in each category
  const categoryCountMap = useMemo(() => {
    const counts: Record<number, number> = {};
    items.forEach(item => {
      counts[item.categoryId] = (counts[item.categoryId] || 0) + 1;
    });
    return counts;
  }, [items]);

  if (loading) {
    return (
      <div style={{ padding: '24px 0', maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
        <div className="tab-container" style={{ padding: '0 24px', borderBottom: 'none', marginBottom: '12px', display: 'flex', gap: '8px' }}>
          <div className="skeleton-card" style={{ height: '36px', width: '110px', borderRadius: '8px' }}></div>
          <div className="skeleton-card" style={{ height: '36px', width: '110px', borderRadius: '8px' }}></div>
        </div>
        <div style={{ padding: '0 24px' }}>
          <div className="skeleton-card" style={{ height: '300px', borderRadius: '12px' }}></div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 0', maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
      <style>{`
        /* ── Menu manager ──────────────────────────────────────────────
           This screen is where the owner changes a price or marks something
           sold out, so it is a list, not a gallery. It used to render the
           storefront's card grid: 140px of artwork per item meant nine rows
           of a 41-item menu were reachable without scrolling, and the price —
           the thing being edited — was the smallest text on the card. */
        .menu-filter-btn {
          background: var(--bg-surface);
          border: 1.5px solid var(--border-color);
          color: var(--text-secondary);
          padding: 8px 14px;
          min-height: 40px;
          border-radius: var(--radius-full);
          font-size: var(--text-sm);
          font-weight: var(--font-semibold);
          cursor: pointer;
          transition: background-color var(--duration-fast) ease,
                      color var(--duration-fast) ease,
                      border-color var(--duration-fast) ease,
                      transform var(--duration-fast) var(--ease-squish);
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .menu-filter-btn:hover {
          background: var(--bg-card-hover);
          color: var(--text-primary);
          border-color: var(--border-active);
        }
        .menu-filter-btn:active { transform: scale(0.95); }
        .menu-filter-btn.active {
          background: var(--color-primary);
          /* Was #fff on --gradient-primary, which is 2.1:1 at the light end
             of the ramp. --color-primary-ink is the paired text colour. */
          color: var(--color-primary-ink);
          border-color: var(--color-primary);
        }

        .dish-list {
          display: flex;
          flex-direction: column;
          border-radius: var(--radius-lg);
          border: 1.5px solid var(--border-color);
          background: var(--bg-surface);
          overflow: hidden;
        }
        .dish-row {
          display: grid;
          grid-template-columns: 56px minmax(0, 1fr) auto auto;
          align-items: center;
          gap: var(--space-4);
          padding: var(--space-3) var(--space-4);
          border-bottom: 1px solid var(--border-subtle);
        }
        .dish-row:last-child { border-bottom: 0; }
        .dish-row:hover { background: var(--bg-card-hover); }
        .dish-row.is-soldout .dish-row-name { color: var(--text-muted); }
        .dish-row.is-soldout .dish-thumbnail { opacity: 0.45; }

        .dish-thumbnail {
          width: 56px;
          height: 56px;
          border-radius: var(--radius-sm);
          object-fit: cover;
          background: var(--bg-secondary);
        }
        .dish-row-name {
          font-size: var(--text-md);
          font-weight: var(--font-bold);
          color: var(--text-primary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .dish-row-meta {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          margin-top: 2px;
          font-size: var(--text-sm);
          color: var(--text-secondary);
        }
        .dish-row-price {
          font-family: var(--font-numeric);
          font-variant-numeric: tabular-nums;
          font-size: var(--text-lg);
          font-weight: var(--font-extrabold);
          color: var(--text-primary);
          text-align: right;
          min-width: 6ch;
        }
        .dish-row-actions {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        /* Availability is the control staff reach for mid-rush, so it is a
           labelled button rather than an unlabelled circle floating on art. */
        .btn-avail-toggle {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          height: 40px;
          padding: 0 14px;
          border-radius: var(--radius-full);
          border: 1.5px solid var(--color-success);
          background: var(--bg-surface);
          color: var(--color-success-on-surface);
          font-size: var(--text-sm);
          font-weight: var(--font-bold);
          cursor: pointer;
          white-space: nowrap;
          transition: transform var(--duration-fast) var(--ease-squish),
                      background-color var(--duration-fast) ease;
        }
        .btn-avail-toggle:active { transform: scale(0.95); }
        .btn-avail-toggle.soldout {
          border-color: var(--color-danger);
          color: var(--color-danger-on-surface);
        }
        .dish-icon-btn {
          width: 40px;
          height: 40px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: var(--radius-full);
          border: 1.5px solid var(--border-color);
          background: var(--bg-surface);
          color: var(--text-secondary);
          cursor: pointer;
          transition: transform var(--duration-fast) var(--ease-squish),
                      color var(--duration-fast) ease,
                      border-color var(--duration-fast) ease;
        }
        .dish-icon-btn:hover { color: var(--text-primary); border-color: var(--border-active); }
        .dish-icon-btn:active { transform: scale(0.92); }
        .dish-icon-btn.danger { color: var(--color-danger-on-surface); }
        .dish-icon-btn.danger:hover { border-color: var(--color-danger); }

        @media (pointer: coarse) {
          .menu-filter-btn,
          .btn-avail-toggle,
          .dish-icon-btn { min-height: 44px; }
          .dish-icon-btn { width: 44px; }
        }

        @media (max-width: 760px) {
          .dish-row {
            grid-template-columns: 48px minmax(0, 1fr) auto;
            grid-template-areas: 'art name price' 'art actions actions';
            row-gap: var(--space-2);
          }
          .dish-thumbnail { width: 48px; height: 48px; grid-area: art; align-self: start; }
          .dish-row-actions { grid-area: actions; justify-content: flex-start; }
        }

        .category-card {
          background: var(--glass-bg);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 16px 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: all 0.2s;
        }
        .category-card:hover {
          border-color: var(--border-active);
          background: rgba(255,255,255,0.02);
        }
      `}</style>

      {/* Sub tabs */}
      <div className="tab-container" style={{ padding: '0 24px', borderBottom: 'none', marginBottom: '16px', display: 'flex', gap: '8px' }}>
        <button onClick={() => handleTabChange('items')} className={`tab sub-tab ${activeTab === 'items' ? 'active' : ''}`} style={{ border: 'none', cursor: 'pointer', padding: '8px 16px', borderRadius: 'var(--radius-sm)', transition: 'all var(--transition-fast)' }}>
          Menu Items
        </button>
        <button onClick={() => handleTabChange('categories')} className={`tab sub-tab ${activeTab === 'categories' ? 'active' : ''}`} style={{ border: 'none', cursor: 'pointer', padding: '8px 16px', borderRadius: 'var(--radius-sm)', transition: 'all var(--transition-fast)' }}>
          Categories
        </button>
      </div>

      <div id="crud-content">
        {activeTab === 'items' ? (
          <div style={{ padding: '0 24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Control Bar: Search & Filters */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', flex: 1 }}>
                
                {/* Search query input */}
                <div style={{ position: 'relative', width: '220px' }}>
                  <input
                    type="text"
                    className="input"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    aria-label="Search the menu"
                    placeholder="Search the menu"
                    style={{ paddingLeft: '36px', height: '40px', fontSize: 'var(--text-sm)' }}
                  />
                  <span aria-hidden="true" className="material-symbols-rounded" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '18px', color: 'var(--text-secondary)' }}>search</span>
                </div>

                {/* Diet filter chips */}
                <button className={`menu-filter-btn ${dietFilter === 'all' ? 'active' : ''}`} onClick={() => setDietFilter('all')}>All</button>
                <button className={`menu-filter-btn ${dietFilter === 'veg' ? 'active' : ''}`} onClick={() => setDietFilter('veg')}>🟢 Veg</button>
                <button className={`menu-filter-btn ${dietFilter === 'nonveg' ? 'active' : ''}`} onClick={() => setDietFilter('nonveg')}>🔺 Non-Veg</button>

                {/* Availability filter chips */}
                <button className={`menu-filter-btn ${statusFilter === 'all' ? 'active' : ''}`} onClick={() => setStatusFilter('all')}>All Status</button>
                <button className={`menu-filter-btn ${statusFilter === 'available' ? 'active' : ''}`} onClick={() => setStatusFilter('available')}>Available</button>
                <button className={`menu-filter-btn ${statusFilter === 'soldout' ? 'active' : ''}`} onClick={() => setStatusFilter('soldout')}>Sold Out</button>

                {/* Category Filter Dropdown */}
                <select
                  className="input"
                  aria-label="Filter by category"
                  value={selectedCatFilter}
                  onChange={(e) => setSelectedCatFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                  style={{ width: '150px', height: '40px', minHeight: '40px', padding: '4px 10px', fontSize: 'var(--text-sm)', fontWeight: 600 }}
                >
                  <option value="all">All Categories</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <button onClick={handleAddItemClick} className="btn btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '40px' }}>
                <span aria-hidden="true" className="material-symbols-rounded" style={{ fontSize: '18px' }}>add</span>
                Add Item
              </button>
            </div>

            {/* Dishes list */}
            <div className="dish-list">
              {filteredItems.length === 0 ? (
                <div style={{ padding: '64px 24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <span className="material-symbols-rounded" style={{ fontSize: '48px', display: 'block', marginBottom: '8px' }} aria-hidden="true">no_meals</span>
                  <div style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)' }}>Nothing matches those filters.</div>
                </div>
              ) : (
                filteredItems.map(item => {
                  const cat = categories.find(c => c.id === item.categoryId);
                  const catName = cat ? cat.name : 'Uncategorised';
                  const isAvailable = item.isAvailable === 1;

                  // categoryArt() gave every drink in a section the same
                  // tile, so a 41-item menu was seven pictures repeated.
                  const resolvedImg = menuItemImageSource(item) || itemArt(item.name, catName);

                  return (
                    <div key={item.id} className={`dish-row${isAvailable ? '' : ' is-soldout'}`}>
                      <img src={resolvedImg} className="dish-thumbnail" alt="" />

                      <div style={{ minWidth: 0 }}>
                        <div className="dish-row-name" title={item.name}>{item.name}</div>
                        <div className="dish-row-meta">
                          <span>{catName}</span>
                          {item.isVeg !== 1 && (
                            <span style={{ color: 'var(--color-danger-on-surface)', fontWeight: 'var(--font-semibold)' }}>
                              &middot; Non-veg
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="dish-row-price">{formatCurrency(item.price)}</div>

                      <div className="dish-row-actions">
                        <button
                          className={`btn-avail-toggle${isAvailable ? '' : ' soldout'}`}
                          onClick={() => handleToggleAvailable(item)}
                          aria-pressed={!isAvailable}
                          title={isAvailable ? `Mark ${item.name} sold out` : `Put ${item.name} back on sale`}
                        >
                          <span className="material-symbols-rounded" style={{ fontSize: '18px' }} aria-hidden="true">
                            {isAvailable ? 'check_circle' : 'do_not_disturb_on'}
                          </span>
                          {isAvailable ? 'On sale' : 'Sold out'}
                        </button>
                        <button
                          onClick={() => handleEditItemClick(item)}
                          className="dish-icon-btn"
                          aria-label={`Edit ${item.name}`}
                          title={`Edit ${item.name}`}
                        >
                          <span className="material-symbols-rounded" style={{ fontSize: '18px' }} aria-hidden="true">edit</span>
                        </button>
                        <button
                          onClick={() => handleDeleteItemClick(item.id!)}
                          className="dish-icon-btn danger"
                          aria-label={`Delete ${item.name}`}
                          title={`Delete ${item.name}`}
                        >
                          <span className="material-symbols-rounded" style={{ fontSize: '18px' }} aria-hidden="true">delete</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          <div style={{ padding: '0 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', margin: 0 }}>Manage Categories ({categories.length})</h3>
              <button onClick={handleAddCategoryClick} className="btn btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <span aria-hidden="true" className="material-symbols-rounded" style={{ fontSize: '18px' }}>add</span>
                Add Category
              </button>
            </div>

            {/* Categories List Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {categories.length === 0 ? (
                <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--glass-bg)', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>No categories found. Click 'Add Category' to start!</div>
              ) : (
                categories.map(cat => {
                  const itemCount = categoryCountMap[cat.id!] || 0;
                  return (
                    <div key={cat.id} className="category-card">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{
                          background: 'rgba(var(--color-primary-rgb), 0.06)',
                          color: 'var(--color-primary)',
                          width: '40px',
                          height: '40px',
                          borderRadius: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 800,
                          fontSize: '1rem',
                          border: '1px solid rgba(var(--color-primary-rgb),0.2)'
                        }}>
                          {cat.sortOrder}
                        </div>
                        <div>
                          <h4 style={{ fontSize: 'var(--text-base)', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>{cat.name}</h4>
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 600, display: 'inline-block', marginTop: '2px' }}>
                            {itemCount} {itemCount === 1 ? 'dish' : 'dishes'} listed
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <span className={`badge ${cat.isActive === 1 ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: 'var(--text-xs)', fontWeight: 800, padding: '3px 8px', textTransform: 'uppercase' }}>
                          {cat.isActive === 1 ? 'Active' : 'Disabled'}
                        </span>
                        
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button onClick={() => handleEditCategoryClick(cat)} className="btn btn-secondary btn-sm" style={{ padding: '4px 10px', height: '30px', display: 'flex', alignItems: 'center', gap: '4px' }}>Edit</button>
                          <button onClick={() => handleDeleteCategoryClick(cat.id!)} className="btn btn-sm" style={{ padding: '4px 10px', height: '30px', background: 'rgba(var(--color-danger-rgb),0.06)', color: '#FF4D4D', border: '1px solid rgba(var(--color-danger-rgb),0.2)' }}>Delete</button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Item Overlay Modal */}
      {itemModalOpen && editingItem && (
        <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setItemModalOpen(false)}>
          <div className="modal" style={{ maxWidth: '480px', width: '100%', margin: '20px', background: 'var(--glass-bg)', backdropFilter: 'blur(30px)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ borderBottom: '1px solid var(--border-glass)', padding: '16px 20px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>{!editingItem.id ? 'Create Menu Item' : 'Modify Menu Item'}</h3>
              <button className="btn-icon" onClick={() => setItemModalOpen(false)}>
                <span aria-hidden="true" className="material-symbols-rounded">close</span>
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '18px', padding: '20px' }}>
              <div className="input-group">
                <label htmlFor="item-name" style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>Item Name</label>
                <input
                  type="text"
                  id="item-name"
                  className="input"
                  value={editingItem.name}
                  onChange={(e) => setEditingItem(prev => prev ? { ...prev, name: e.target.value } : null)}
                  placeholder="e.g. Watermelon Cooler"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="input-group">
                  <label htmlFor="item-cat" style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>Category</label>
                  <select
                    id="item-cat"
                    className="input"
                    value={editingItem.categoryId}
                    onChange={(e) => setEditingItem(prev => prev ? { ...prev, categoryId: Number(e.target.value) } : null)}
                    style={{ fontWeight: 700 }}
                  >
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="input-group">
                  <label htmlFor="item-price" style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>Price (₹)</label>
                  <input
                    type="number"
                    id="item-price"
                    className="input"
                    value={editingItem.price}
                    onChange={(e) => setEditingItem(prev => prev ? { ...prev, price: Number(e.target.value) } : null)}
                    style={{ fontWeight: 700 }}
                  />
                </div>
              </div>

              {/* Image upload dropzone */}
              <div className="input-group">
                <label htmlFor="item-image-file" style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Dish Image — any photo, resized automatically
                </label>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                  <img
                    id="item-image-preview"
                    src={menuItemImageSource(editingItem) || itemArt(editingItem.name, categories.find(c => c.id === Number(editingItem.categoryId))?.name)}
                    style={{ width: '60px', height: '60px', borderRadius: '10px', objectFit: 'cover', border: '1px solid var(--border-glass)', boxShadow: '0 0 10px rgba(0,0,0,0.2)' }}
                    alt="Preview"
                  />
                  <div style={{ flex: 1, position: 'relative' }}>
                    <input
                      type="file"
                      id="item-image-file"
                      onChange={handleItemImageUpload}
                      accept="image/*"
                      disabled={imageUploading}
                      className="input"
                      style={{ padding: '6px', fontSize: 'var(--text-sm)', height: 'auto' }}
                    />
                    {imageUploading && (
                      <div className="loading-spinner" style={{ position: 'absolute', right: '12px', top: '10px', width: '16px', height: '16px', borderWidth: '2px' }}></div>
                    )}
                  </div>
                  {(editingItem.imageUrl || editingItem.imageData) && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={handleRemoveItemImage}
                      disabled={imageUploading}
                      title="Remove image"
                      style={{ padding: '8px 10px', fontSize: 'var(--text-sm)', fontWeight: 700 }}
                    >
                      <span aria-hidden="true" className="material-symbols-rounded" style={{ fontSize: '16px' }}>delete</span>
                    </button>
                  )}
                </div>
                <input
                  type="url"
                  id="item-image-url"
                  className="input"
                  value={editingItem.imageUrl || ''}
                  onChange={(e) => handleImageUrlChange(e.target.value)}
                  placeholder="…or paste an image link (https://…)"
                  style={{ marginTop: '8px', fontSize: 'var(--text-sm)' }}
                />
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '6px' }}>
                  {imageUploading
                    ? 'Optimising and uploading…'
                    : editingItem.imageData
                      ? 'Stored on this device only — sign in to the cloud to share it with every terminal.'
                      : 'Large photos are compressed to about 400 KB before upload.'}
                </div>
              </div>

              <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="input-group">
                  <label htmlFor="item-veg" style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>Dietary Type</label>
                  <select
                    id="item-veg"
                    className="input"
                    value={editingItem.isVeg}
                    onChange={(e) => setEditingItem(prev => prev ? { ...prev, isVeg: Number(e.target.value) } : null)}
                    style={{ fontWeight: 700 }}
                  >
                    <option value={1}>🟢 Veg (Vegetarian)</option>
                    <option value={0}>🔺 Non-Veg (Egg/Meat)</option>
                  </select>
                </div>

                <div className="input-group">
                  <label htmlFor="item-avail" style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>Availability</label>
                  <select
                    id="item-avail"
                    className="input"
                    value={editingItem.isAvailable}
                    onChange={(e) => setEditingItem(prev => prev ? { ...prev, isAvailable: Number(e.target.value) } : null)}
                    style={{ fontWeight: 700 }}
                  >
                    <option value={1}>Available</option>
                    <option value={0}>Sold Out</option>
                  </select>
                </div>
              </div>

              <div className="input-group">
                <label htmlFor="item-sort" style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>Sort Order Weight</label>
                <input
                  type="number"
                  id="item-sort"
                  className="input"
                  value={editingItem.sortOrder}
                  onChange={(e) => setEditingItem(prev => prev ? { ...prev, sortOrder: Number(e.target.value) } : null)}
                />
              </div>
            </div>

            <div className="modal-footer" style={{ borderTop: '1px solid var(--border-glass)', padding: '16px 20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setItemModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleSaveItem}>Save Menu Item</button>
            </div>
          </div>
        </div>
      )}

      {/* Category Overlay Modal */}
      {categoryModalOpen && editingCategory && (
        <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setCategoryModalOpen(false)}>
          <div className="modal" style={{ maxWidth: '440px', width: '100%', margin: '20px', background: 'var(--glass-bg)', backdropFilter: 'blur(30px)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ borderBottom: '1px solid var(--border-glass)', padding: '16px 20px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>{!editingCategory.id ? 'Create Category' : 'Modify Category'}</h3>
              <button className="btn-icon" onClick={() => setCategoryModalOpen(false)}>
                <span aria-hidden="true" className="material-symbols-rounded">close</span>
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '18px', padding: '20px' }}>
              <div className="input-group">
                <label htmlFor="cat-name" style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>Category Name</label>
                <input
                  type="text"
                  id="cat-name"
                  className="input"
                  value={editingCategory.name}
                  onChange={(e) => setEditingCategory(prev => prev ? { ...prev, name: e.target.value } : null)}
                  placeholder="e.g. Cold-Pressed"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="input-group">
                  <label htmlFor="cat-sort" style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>Sort Order Index</label>
                  <input
                    type="number"
                    id="cat-sort"
                    className="input"
                    value={editingCategory.sortOrder}
                    onChange={(e) => setEditingCategory(prev => prev ? { ...prev, sortOrder: Number(e.target.value) } : null)}
                  />
                </div>

                <div className="input-group">
                  <label htmlFor="cat-active" style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>Status</label>
                  <select
                    id="cat-active"
                    className="input"
                    value={editingCategory.isActive}
                    onChange={(e) => setEditingCategory(prev => prev ? { ...prev, isActive: Number(e.target.value) } : null)}
                    style={{ fontWeight: 700 }}
                  >
                    <option value={1}>Active</option>
                    <option value={0}>Disabled</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="modal-footer" style={{ borderTop: '1px solid var(--border-glass)', padding: '16px 20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setCategoryModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleSaveCategory}>Save Category</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
