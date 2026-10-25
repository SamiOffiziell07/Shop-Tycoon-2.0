// shop.js – Hilfen für den Einkauf: Gewinnspanne und fertige Teile-Sets (Starter-Sets).
// Gekauft wird über Procurement (suppliers.js): Bestellung -> Lieferzeit -> Lager. Hier gibt es keinen Sofortkauf mehr.
'use strict';

const Shop = (() => {
  const MAX_QTY_PER_ORDER = 99;

  // Fertige, zueinander passende Teile-Sets. Alle Teile sind bei Eckhardt Computerhandel (Stufe 1) lieferbar.
  const SETS = [
    {
      id: 'buero', name: 'Starter-Set: Büro-PC', desc: 'Alle Teile für einen sparsamen Büro-PC (Ryzen 5 7600 mit integrierter Grafik, 16 GB DDR5, 500 GB SSD).',
      parts: ['case-fractal-design-pop-mini-air', 'mb-asrock-b650m-pro-rs', 'cpu-amd-ryzen-5-7600', 'cooler-arctic-freezer-36', 'ram-kingston-fury-beast-16gb-ddr5-5600', 'ssd-kingston-nv2-500gb', 'psu-corsair-cv550'],
    },
    {
      id: 'gaming', name: 'Set: Einsteiger-Gaming-PC', desc: 'Ryzen 5 5600 mit GeForce RTX 4060, 32 GB DDR4 und 1 TB SSD für Full-HD-Spiele.',
      parts: ['case-corsair-4000d-airflow', 'mb-msi-b550-a-pro', 'cpu-amd-ryzen-5-5600', 'cooler-thermalright-peerless-assassin-120-se', 'ram-kingston-fury-beast-32gb-ddr4-3200', 'gpu-nvidia-geforce-rtx-4060-8gb', 'ssd-samsung-990-pro-1tb', 'psu-corsair-rm750e'],
    },
  ];

  return {
    MAX_QTY_PER_ORDER,
    SETS,
    // Gewinn je Stück, wenn man zum Listenverkaufspreis verkauft
    margin(item, price) {
      return Math.round((item.sellPrice - price) * 100) / 100;
    },
  };
})();

if (typeof window !== 'undefined') window.Shop = Shop;
if (typeof module !== 'undefined') module.exports = Shop;
