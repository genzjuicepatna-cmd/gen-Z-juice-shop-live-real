import type { Metadata } from 'next';
import { StaticPageChrome } from '../_components/StaticPageChrome';
import { StorefrontJsonLd } from '../_components/StorefrontJsonLd';
import { STORE_PROFILE } from '../../content/storefront';
import { BRAND } from '../../content/brand';
import snapshot from '../../data/menu-snapshot.json';

export const metadata: Metadata = {
  title: `Full Menu & Prices — ${BRAND.name}, Kumhrar Patna`,
  description:
    `The full menu at ${BRAND.name}, Kumhrar, Patna — fresh juices, shakes, virgin mojitos, lassi and combos, every drink in two sizes, with current prices.`,
  alternates: { canonical: '/menu' },
  openGraph: {
    title: `Full Menu & Prices — ${BRAND.name}, Patna`,
    description: `Every drink and price at ${BRAND.name}, Kumhrar. Order online for delivery, pickup or your table.`,
    type: 'website'
  }
};

function formatPrice(price: number) {
  return `₹${Number(price || 0).toFixed(0)}`;
}

export default function MenuPage() {
  const itemCount = snapshot.categories.reduce((sum, category) => sum + category.items.length, 0);

  return (
    <>
      <StorefrontJsonLd page="menu" />
      <StaticPageChrome
        active="/menu"
        eyebrow="Menu"
        title="Everything we make, with prices"
        copy={`${itemCount} drinks across ${snapshot.categories.length} sections, made to order at ${STORE_PROFILE.streetAddress}, ${STORE_PROFILE.locality}.`}
      >
        {itemCount === 0 ? (
          <p className="static-page-empty">
            Our menu is being updated. Please call the store for today&apos;s drinks.
          </p>
        ) : (
          <div className="static-menu">
            {snapshot.categories.map(category => (
              <section key={category.id} className="static-menu-section">
                <h2>
                  {category.icon ? <span aria-hidden="true">{category.icon} </span> : null}
                  {category.name}
                </h2>
                <ul>
                  {category.items.map(item => (
                    <li key={item.id}>
                      <span className={item.isVeg ? 'static-menu-mark veg' : 'static-menu-mark nonveg'} aria-hidden="true" />
                      <span className="static-menu-name">{item.name}</span>
                      <span className="sr-only">{item.isVeg ? 'Vegetarian' : 'Non vegetarian'}</span>
                      <span className="static-menu-price">{formatPrice(item.price)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        <p className="static-page-note">
          Prices include preparation; taxes and any delivery fee are shown at checkout.
        </p>
      </StaticPageChrome>
    </>
  );
}
