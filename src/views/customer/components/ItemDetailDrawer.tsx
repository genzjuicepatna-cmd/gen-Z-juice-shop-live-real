// @ts-nocheck
import React, { useState } from 'react';
import { formatCurrency, playSound, vibrateDevice, menuItemImageSource } from '../../../utils/helpers';

import { BRAND } from '../../../content/brand';

import { itemArt } from '../../../content/categoryArt';
import { categoryBlurb } from '../../../content/storefront';

export function ItemDetailDrawer({ item, categories, onClose, onAddToCart }) {
  const [qty, setQty] = useState(1);
  const [sugar, setSugar] = useState('Normal');
  const [modifiers, setModifiers] = useState([]);
  const [customNotes, setCustomNotes] = useState('');

  if (!item) return null;

  const getItemImage = () => {
    const source = menuItemImageSource(item);
    if (source) return source;
    // itemArt, not categoryArt: the card the customer tapped shows per-item
    // art, and the drawer showing a different picture reads as the wrong item.
    const cat = categories.find(c => c.id === item.categoryId);
    return itemArt(item.name, cat?.name || '');
  };

  const getItemDescription = () => {
    if (item.description) return item.description;
    const cat = categories.find(c => c.id === item.categoryId);
    return categoryBlurb(cat?.name);
  };

  const handleModifierChange = (modName, checked) => {
    playSound(620, 60);
    if (checked) {
      setModifiers([...modifiers, modName]);
    } else {
      setModifiers(modifiers.filter(m => m !== modName));
    }
  };

  // Priced add-ons. Kept as a table so the price and the label cannot drift
  // apart the way "Extra Cheese +30" did when it was two separate literals.
  const ADD_ONS = [
    { id: 'Dry fruit topping', price: 30, note: 'Cashew, almond and raisin' },
    { id: 'Chia seeds', price: 20, note: 'Stirred through' },
    { id: 'No ice', price: 0, note: 'Same cup, less dilution' },
  ];
  const addOnCost = ADD_ONS
    .filter(a => modifiers.includes(a.id))
    .reduce((sum, a) => sum + a.price, 0);
  const singleItemPrice = item.price + addOnCost;
  const totalPrice = singleItemPrice * qty;

  const handleAdd = () => {
    onAddToCart({
      item,
      qty,
      sugar,
      modifiers,
      customNotes,
      price: singleItemPrice
    });
  };

  const isVeg = item.isVeg ? 'veg' : 'nonveg';

  return (
    <div className="aether-drawer-overlay is-open" onClick={(e) => e.target.classList.contains('aether-drawer-overlay') && onClose()}>
      <div className="aether-drawer-sheet">
        <div className="aether-drawer-handle"></div>
        <button 
          className="aether-drawer-close-btn" 
          type="button" 
          aria-label="Close"
          onClick={onClose}
        >
          <span aria-hidden="true" className="material-symbols-rounded">close</span>
        </button>

        <div className="aether-drawer-scroll-content">
          <div className="aether-drawer-hero-wrapper">
            <img className="aether-drawer-hero-img" src={getItemImage()} alt={item.name} />
            <span className={`store-food-mark ${isVeg}`} style={{ position: 'absolute', top: '16px', right: '16px', zIndex: 2, boxShadow: '0 4px 10px rgba(0,0,0,0.3)' }}></span>
          </div>

          <div className="aether-drawer-body">
            <div className="aether-drawer-header">
              <h2>{item.name}</h2>
              <span className="aether-drawer-price">{formatCurrency(item.price)}</span>
            </div>
            <p class="aether-drawer-desc">{getItemDescription()}</p>

            {/* Was "Spicy Level: Mild / Hot / Volcanic", left over from the
                Indo-Chinese menu this codebase started on. Sugar is the thing
                people actually ask to change at a juice counter. */}
            <div className="aether-drawer-section">
              <h3>Sugar</h3>
              <div className="aether-choice-grid">
                {[
                  { value: 'No sugar', icon: 'eco', hint: 'Just the fruit', tone: 'var(--color-success-on-surface)' },
                  { value: 'Less sugar', icon: 'contrast', hint: 'Half the usual', tone: 'var(--color-info-on-surface)' },
                  { value: 'Normal', icon: 'check_circle', hint: 'How we make it', tone: 'var(--color-primary-on-surface)' },
                ].map(option => (
                  <label className="aether-choice-option" key={option.value}>
                    <input
                      type="radio"
                      name="sugar-level"
                      value={option.value}
                      checked={sugar === option.value}
                      onChange={() => setSugar(option.value)}
                    />
                    <span className="aether-choice-card">
                      <span aria-hidden="true" className="material-symbols-rounded" style={{ color: option.tone }}>{option.icon}</span>
                      <strong>{option.value}</strong>
                      <small>{option.hint}</small>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="aether-drawer-section">
              <h3>Add something</h3>
              <div className="aether-modifiers-list">
                {ADD_ONS.map(addOn => (
                  <label className="aether-modifier-item" key={addOn.id}>
                    <input
                      type="checkbox"
                      name="modifier"
                      value={addOn.id}
                      checked={modifiers.includes(addOn.id)}
                      onChange={(e) => handleModifierChange(addOn.id, e.target.checked)}
                    />
                    <span className="aether-checkbox-visual"></span>
                    <div className="aether-modifier-label">
                      <strong>{addOn.id}</strong>
                      <small>{addOn.note}{addOn.price > 0 ? ` (+${formatCurrency(addOn.price)})` : ''}</small>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="aether-drawer-section">
              <h3>Anything else?</h3>
              <textarea 
                className="aether-textarea" 
                rows="2" 
                placeholder="E.g. serve without straw, pack the lid tight..."
                value={customNotes}
                onChange={(e) => setCustomNotes(e.target.value)}
              ></textarea>
            </div>
          </div>
        </div>

        <div className="aether-drawer-action-bar">
          <div className="aether-drawer-quantity-stepper">
            <button 
              className="aether-qty-btn minus" 
              type="button"
              onClick={() => {
                if (qty > 1) {
                  playSound(600, 60);
                  setQty(qty - 1);
                }
              }}
            >-</button>
            <span className="aether-qty-count">{qty}</span>
            <button 
              className="aether-qty-btn plus" 
              type="button"
              onClick={() => {
                playSound(650, 70);
                setQty(qty + 1);
              }}
            >+</button>
          </div>
          <button 
            className="btn btn-primary" 
            id="drawer-add-to-cart-btn" 
            type="button" 
            style={{ flex: 1, height: '48px', fontWeight: 800, borderRadius: 'var(--radius-md)' }}
            onClick={handleAdd}
          >
            Add to Cart — {formatCurrency(totalPrice)}
          </button>
        </div>
      </div>
    </div>
  );
}
