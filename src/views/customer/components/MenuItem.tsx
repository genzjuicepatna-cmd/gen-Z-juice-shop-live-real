// @ts-nocheck
import React from 'react';
import { globalStore } from '../../../store/Store';
import { formatCurrency, escapeHtml, menuItemImageSource } from '../../../utils/helpers';


import { itemArt, itemTint } from '../../../content/categoryArt';
import { categoryBlurb } from '../../../content/storefront';

export function MenuItem({ item, categories, cart, onOpenDetails }) {
  const cartItem = cart.find(ci => ci.itemId === item.id);
  const qty = cartItem?.quantity || 0;

  const categoryName = categories.find(c => c.id === item.categoryId)?.name || '';

  const getItemImage = () => menuItemImageSource(item) || itemArt(item.name, categoryName);

  const getItemDescription = () => {
    if (item.description) return item.description;
    return categoryBlurb(categoryName);
  };

  const handleCardClick = (e) => {
    // `.store-menu-item-open` handles its own click; letting it bubble here
    // would open the drawer twice.
    if (
      e.target.closest('.stepper') ||
      e.target.closest('.btn-step') ||
      e.target.closest('.store-add-btn') ||
      e.target.closest('.store-menu-item-open')
    ) {
      return;
    }
    if (onOpenDetails) {
      onOpenDetails(item);
    }
  };

  return (
    <article 
      className={`store-menu-item ${qty ? 'is-selected' : ''}`} 
      onClick={handleCardClick}
      /* Per-item pastel tint. Pastels only, and never behind body copy — the
         text sits on the white body panel below the art. */
      style={{ cursor: onOpenDetails ? 'pointer' : 'default', '--item-tint': itemTint(item.name) }}
    >
      <img 
        className="store-menu-item-image" 
        src={getItemImage()} 
        alt={item.name} 
        width="640" 
        height="420" 
        loading="lazy" 
        decoding="async" 
      />
      <div className="store-menu-item-body">
        <div className="store-menu-item-title">
          {/* The card as a whole is click-to-open for mouse users, but that is
              invisible to the keyboard. This button is the focusable, labelled
              equivalent — it cannot be the <article> itself, because the card
              already contains the stepper and Add controls. */}
          <button
            type="button"
            className="store-menu-item-open"
            onClick={() => onOpenDetails?.(item)}
            disabled={!onOpenDetails}
            aria-label={`View details for ${item.name}`}
          >
            <h3>{item.name}</h3>
            <p>{getItemDescription()}</p>
          </button>
          <span className={item.isVeg ? 'store-food-mark veg' : 'store-food-mark nonveg'} aria-hidden="true"></span>
          <span className="sr-only">{item.isVeg ? 'Vegetarian' : 'Non vegetarian'}</span>
        </div>
        <div className="store-menu-item-footer">
          <strong>{formatCurrency(item.price)}</strong>
          {qty ? (
            <div className="stepper store-stepper" aria-label={`Quantity for ${item.name}`}>
              <button 
                className="btn-step" 
                onClick={() => globalStore.adjustCartQuantity(item.id, -1)} 
                type="button" 
                aria-label={`Remove one ${item.name}`}
              >-</button>
              <div className="stepper-count">{qty}</div>
              <button 
                className="btn-step" 
                onClick={() => globalStore.adjustCartQuantity(item.id, 1)} 
                type="button" 
                aria-label={`Add another ${item.name}`}
              >+</button>
            </div>
          ) : (
            <button 
              className="btn btn-primary btn-add store-add-btn" 
              onClick={() => globalStore.addToCart(item, 1)} 
              type="button"
              aria-label={`Add ${item.name} to cart`}
            >
              <span className="material-symbols-rounded" aria-hidden="true">add</span>
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
