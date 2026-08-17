import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Bike, MapPin, Clock, CheckCircle, Package, Navigation } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { client } from '@/lib/api';
import { getGuestSessionId } from '@/lib/guest-session';
import { useTranslation } from '@/lib/i18n';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix leaflet default marker icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface ETAData {
  status: string;
  eta_minutes: number | null;
  eta_seconds?: number | null;
  calculated_at?: string | null;
  rider_name: string | null;
  rider_phone: string | null;
  rider_lat: number | null;
  rider_lng: number | null;
  rider_location_updated_at?: string | null;
}

const STATUS_STEPS = [
  { key: 'assigned', label: 'Order Assigned', icon: Package, description: 'Rider is preparing to pick up' },
  { key: 'picked_up', label: 'Picked Up', icon: Bike, description: 'Rider has your order' },
  { key: 'on_the_way', label: 'On the Way', icon: Navigation, description: 'Rider is heading to you' },
  { key: 'delivered', label: 'Delivered', icon: CheckCircle, description: 'Order delivered!' },
];

export default function DeliveryTracking() {
  const { t } = useTranslation();
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const [eta, setEta] = useState<ETAData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const riderMarkerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (orderId) {
      loadETA();
      const interval = setInterval(loadETA, 10000); // Refresh every 10s
      return () => clearInterval(interval);
    }
  }, [orderId]);

  useEffect(() => {
    if (eta && eta.rider_lat && eta.rider_lng) {
      updateMap(eta.rider_lat, eta.rider_lng);
    }
  }, [eta]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function loadETA() {
    try {
      const res = await client.apiCall.invoke({
        url: `/api/v1/rider/delivery-eta/${orderId}?session_id=${encodeURIComponent(getGuestSessionId())}`,
        method: 'GET',
      });
      if (res?.data) {
        setEta(res.data);
        setError('');
      }
    } catch (e: any) {
      setError('Could not load tracking info');
    } finally {
      setLoading(false);
    }
  }

  function updateMap(lat: number, lng: number) {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current).setView([lat, lng], 14);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
      }).addTo(map);
      mapInstanceRef.current = map;

      // Create rider marker with custom icon
      const riderIcon = L.divIcon({
        html: '<div style="background:#dc2626;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)"><span style="font-size:16px">🏍️</span></div>',
        className: '',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });
      riderMarkerRef.current = L.marker([lat, lng], { icon: riderIcon }).addTo(map);
    } else {
      // Update existing marker position
      if (riderMarkerRef.current) {
        riderMarkerRef.current.setLatLng([lat, lng]);
      }
      mapInstanceRef.current.panTo([lat, lng]);
    }
  }

  function getStatusIndex(status: string): number {
    const normalized = status === 'accepted' ? 'assigned' : status;
    return STATUS_STEPS.findIndex(s => s.key === normalized);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400">Loading tracking info...</div>
      </div>
    );
  }

  if (error && !eta) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-gray-400 mb-4">{error}</p>
          <Button onClick={() => navigate('/my-orders')} className="bg-red-600 hover:bg-red-700 text-white cursor-pointer">
            Back to Orders
          </Button>
        </div>
      </div>
    );
  }

  const currentStatusIndex = eta ? getStatusIndex(eta.status) : -1;
  const etaBaseMs = eta?.calculated_at ? new Date(eta.calculated_at).getTime() : now;
  const etaDeadlineMs = etaBaseMs + Number(eta?.eta_seconds || eta?.eta_minutes || 0) * (eta?.eta_seconds ? 1000 : 60_000);
  const remainingEtaSeconds = Math.max(0, Math.floor((etaDeadlineMs - now) / 1000));
  const etaClock = `${Math.floor(remainingEtaSeconds / 60)}:${String(remainingEtaSeconds % 60).padStart(2, '0')}`;

  return (
    <div className="min-h-screen bg-gray-950 px-4 py-6">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" onClick={() => navigate('/my-orders')} className="text-gray-400 cursor-pointer p-2">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-white text-xl font-bold">Track Order #{orderId}</h1>
            <p className="text-gray-500 text-sm">Live delivery tracking</p>
          </div>
        </div>

        {/* No Rider Assigned */}
        {eta?.status === 'no_rider' && (
          <Card className="bg-gray-900 border-gray-800 p-6 text-center">
            <Package className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <h2 className="text-white font-semibold mb-1">Preparing Your Order</h2>
            <p className="text-gray-500 text-sm">A rider will be assigned shortly. Check back soon!</p>
          </Card>
        )}

        {/* Delivered */}
        {eta?.status === 'delivered' && (
          <Card className="bg-green-600/10 border-green-600/30 p-6 text-center">
            <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
            <h2 className="text-green-400 font-semibold text-lg mb-1">Order Delivered!</h2>
            <p className="text-green-400/70 text-sm">Enjoy your meal 🍕</p>
          </Card>
        )}

        {/* Active Tracking */}
        {eta && eta.status !== 'no_rider' && eta.status !== 'delivered' && (
          <>
            {/* ETA Card */}
            <Card className="bg-gray-900 border-gray-800 p-5 mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-xs uppercase tracking-wider">Estimated Arrival</p>
                  <p className="text-white text-3xl font-bold mt-1">
                    {eta.eta_seconds || eta.eta_minutes
                      ? (remainingEtaSeconds > 0 ? etaClock : 'Arriving soon')
                      : 'ETA updating'}
                  </p>
                  <p className="text-blue-400/70 text-xs mt-1">
                    {eta.eta_seconds || eta.eta_minutes
                      ? 'Live rider ETA'
                      : t('orders.eta_waiting_gps')}
                  </p>
                </div>
                <div className="w-16 h-16 bg-red-600/20 rounded-full flex items-center justify-center">
                  <Clock className="w-8 h-8 text-red-400" />
                </div>
              </div>
            </Card>

            {/* Rider Info */}
            {eta.rider_name && (() => {
              let waPhone = String(eta.rider_phone || '').replace(/\D/g, '');
              if (waPhone.startsWith('0')) waPhone = `971${waPhone.slice(1)}`;
              if (waPhone.length <= 10 && !waPhone.startsWith('971')) waPhone = `971${waPhone}`;
              return (
              <a
                href={waPhone ? `https://wa.me/${waPhone}` : undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="block mb-4"
              >
              <Card className="bg-gray-900 border-gray-800 p-4 hover:border-emerald-600/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center">
                      <Bike className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="text-white font-semibold">{eta.rider_name}</p>
                      <p className="text-emerald-400 text-xs">Tap to WhatsApp rider</p>
                    </div>
                  </div>
                  <div className="w-10 h-10 bg-emerald-600 rounded-full flex items-center justify-center text-white font-bold">WA</div>
                </div>
              </Card>
              </a>
              );
            })()}

            {/* Map */}
            {eta.rider_lat != null && eta.rider_lng != null && (
              <div ref={mapContainerRef} className="w-full h-[250px] rounded-xl overflow-hidden border border-gray-700 mb-4" style={{ zIndex: 1 }} />
            )}
            {eta.rider_name && (eta.rider_lat == null || eta.rider_lng == null) && (
              <Card className="bg-amber-950/30 border-amber-700/40 p-4 mb-4 text-amber-300 text-sm">
                Rider live location is waiting for GPS. The Rider app must stay signed in with location permission enabled.
              </Card>
            )}

            {/* Status Progress */}
            <Card className="bg-gray-900 border-gray-800 p-4">
              <h3 className="text-white font-semibold mb-4">Delivery Progress</h3>
              <div className="space-y-4">
                {STATUS_STEPS.map((step, index) => {
                  const isCompleted = index <= currentStatusIndex;
                  const isCurrent = index === currentStatusIndex;
                  const StepIcon = step.icon;
                  return (
                    <div key={step.key} className="flex items-start gap-3">
                      <div className="flex flex-col items-center">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          isCompleted ? 'bg-green-600' : 'bg-gray-800 border border-gray-700'
                        } ${isCurrent ? 'ring-2 ring-green-400 ring-offset-2 ring-offset-gray-900' : ''}`}>
                          <StepIcon className={`w-4 h-4 ${isCompleted ? 'text-white' : 'text-gray-500'}`} />
                        </div>
                        {index < STATUS_STEPS.length - 1 && (
                          <div className={`w-0.5 h-6 mt-1 ${isCompleted ? 'bg-green-600' : 'bg-gray-700'}`} />
                        )}
                      </div>
                      <div className="pt-1">
                        <p className={`text-sm font-medium ${isCompleted ? 'text-white' : 'text-gray-500'}`}>
                          {step.label}
                        </p>
                        {isCurrent && (
                          <p className="text-gray-500 text-xs mt-0.5">{step.description}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </>
        )}

        {/* Refresh hint */}
        <p className="text-center text-gray-600 text-xs mt-4">
          Auto-refreshing every 10 seconds
        </p>
      </div>
    </div>
  );
}
