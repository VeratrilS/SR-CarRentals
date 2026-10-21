let scriptLoaded = false;

export function loadRazorpayScript() {
  if (scriptLoaded && window.Razorpay) return Promise.resolve();

  return new Promise((resolve, reject) => {
    if (document.querySelector('script[src*="razorpay"]')) {
      scriptLoaded = true;
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => {
      scriptLoaded = true;
      resolve();
    };
    script.onerror = () => reject(new Error('Failed to load Razorpay SDK'));
    document.body.appendChild(script);
  });
}

export function openRazorpayCheckout({ keyId, orderId, amount, currency, bookingDescription, user, onSuccess, onDismiss, onFailure }) {
  const options = {
    key: keyId,
    amount,
    currency: currency || 'INR',
    order_id: orderId,
    name: 'SR-CarRentals',
    description: bookingDescription || 'Self-drive car rental',
    prefill: {
      name: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : '',
      email: user?.email || '',
    },
    theme: { color: '#0f766e' },
    handler: (response) => onSuccess(response),
    modal: { ondismiss: onDismiss },
  };

  const rzp = new window.Razorpay(options);
  rzp.on('payment.failed', onFailure);
  rzp.open();
  return rzp;
}
