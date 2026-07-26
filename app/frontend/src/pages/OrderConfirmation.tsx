import { Link, useLocation } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import CustomerLayout from '@/components/CustomerLayout';

export default function OrderConfirmation() {
  const location = useLocation();
  const orderId = location.state?.orderId;

  return (
    <CustomerLayout>
      <div className="bg-black min-h-screen flex flex-col items-center justify-center px-4 text-center">
        <div className="w-20 h-20 rounded-full bg-green-600/20 flex items-center justify-center mb-6">
          <CheckCircle className="w-12 h-12 text-green-500" />
        </div>
        <h1 className="text-white text-3xl font-bold mb-4">Order Confirmed!</h1>
        {orderId && (
          <p className="text-green-400 font-semibold text-lg mb-2">Order #{orderId}</p>
        )}
        <p className="text-gray-400 max-w-md mb-8 text-lg">
          Thank you! Your order has been received. Please collect your order from Vita Napoli at your selected pickup time.
        </p>
        <div className="flex gap-4">
          <Link to="/my-orders">
            <Button className="bg-red-600 hover:bg-red-700 text-white cursor-pointer">
              View My Orders
            </Button>
          </Link>
          <Link to="/menu">
            <Button variant="outline" className="border-gray-600 text-gray-300 hover:bg-gray-800 cursor-pointer">
              Order More
            </Button>
          </Link>
        </div>
      </div>
    </CustomerLayout>
  );
}