import { useEffect, useRef, useState } from 'react';
import {
  Check,
  LocateFixed,
  MapPin,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { toast } from 'sonner';

import AdminSettingsPageLayout from '@/components/admin/AdminSettingsPageLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { client } from '@/lib/api';
import {
  loadRestaurantSettings,
  readExtendedSettings,
  saveExtendedSettings,
  updateRestaurantSettings,
} from '@/lib/admin-settings-store';

interface Zone {
  id: number;
  zone_name: string;
  min_distance_km: number;
  max_distance_km: number;
  charge: number;
  is_active: boolean;
}

export default function AdminDeliverySettings() {
  const local = readExtendedSettings();
  const [settingsId, setSettingsId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    delivery_enabled: local.delivery_enabled,
    estimated_delivery_time: local.estimated_delivery_time,
    restaurant_lat: local.restaurant_lat,
    restaurant_lng: local.restaurant_lng,
  });

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const settings = await loadRestaurantSettings();
      if (!settings) return;

      setSettingsId(Number(settings.id));
      setForm({
        delivery_enabled: settings.delivery_enabled === true,
        estimated_delivery_time:
          settings.estimated_delivery_time ||
          local.estimated_delivery_time,
        restaurant_lat:
          String(settings.restaurant_lat || local.restaurant_lat),
        restaurant_lng:
          String(settings.restaurant_lng || local.restaurant_lng),
      });
    } catch (error) {
      console.error(error);
    }
  }

  async function save() {
    if (!settingsId) {
      toast.error('Restaurant settings record was not found');
      return;
    }

    setSaving(true);
    try {
      await updateRestaurantSettings(settingsId, form);
      saveExtendedSettings(form);
      toast.success('Delivery and shop location saved');
    } catch (error: any) {
      toast.error(error?.message || 'Could not save delivery settings');
    } finally {
      setSaving(false);
    }
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      toast.error('Location is not supported by this browser');
      return;
    }

    toast.info('Getting current location...');
    navigator.geolocation.getCurrentPosition(
      position => {
        const restaurant_lat =
          position.coords.latitude.toFixed(6);
        const restaurant_lng =
          position.coords.longitude.toFixed(6);

        setForm({
          ...form,
          restaurant_lat,
          restaurant_lng,
        });

        toast.success('Shop location selected');
      },
      error => toast.error(error.message),
      {
        enableHighAccuracy: true,
        timeout: 15000,
      },
    );
  }

  return (
    <AdminSettingsPageLayout
      title="Delivery & Location"
      subtitle="Delivery switch, distance zones, rider charge and map pin"
      maxWidth="max-w-5xl"
    >
      <div className="space-y-5">
        <Card className="bg-gray-900 border-gray-800 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-white font-semibold">
                Delivery Orders
              </h2>
              <p className="text-gray-500 text-sm mt-1">
                Delivery charge from the matched zone is rider earning
              </p>
            </div>

            <Switch
              checked={form.delivery_enabled}
              onCheckedChange={checked =>
                setForm({ ...form, delivery_enabled: checked })
              }
            />
          </div>

          {form.delivery_enabled && (
            <div className="mt-5">
              <Label className="text-gray-300">
                Estimated Delivery Time
              </Label>
              <Input
                value={form.estimated_delivery_time}
                onChange={event =>
                  setForm({
                    ...form,
                    estimated_delivery_time: event.target.value,
                  })
                }
                placeholder="30-45 min"
                className="bg-gray-800 border-gray-700 text-white mt-1 max-w-sm"
              />
            </div>
          )}
        </Card>

        {form.delivery_enabled && (
          <Card className="bg-gray-900 border-gray-800 p-6">
            <h2 className="text-white font-semibold mb-2">
              Delivery Zones
            </h2>
            <p className="text-gray-500 text-sm mb-4">
              Customer distance selects the first matching active zone
            </p>
            <DeliveryZonesManager />
          </Card>
        )}

        <Card className="bg-gray-900 border-gray-800 p-6">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="w-5 h-5 text-red-400" />
            <h2 className="text-white font-semibold">
              Exact Shop Location
            </h2>
          </div>

          <Button
            type="button"
            onClick={useCurrentLocation}
            className="bg-blue-600 hover:bg-blue-700 text-white mb-3"
          >
            <LocateFixed className="w-4 h-4 mr-2" />
            Use My Current Location
          </Button>

          <p className="text-gray-500 text-xs mb-3">
            Lat: {form.restaurant_lat} · Lng: {form.restaurant_lng}
          </p>

          <LocationMap
            lat={Number.parseFloat(form.restaurant_lat)}
            lng={Number.parseFloat(form.restaurant_lng)}
            onLocationChange={(lat, lng) =>
              setForm({
                ...form,
                restaurant_lat: lat.toFixed(6),
                restaurant_lng: lng.toFixed(6),
              })
            }
          />
        </Card>

        <Button
          onClick={() => void save()}
          disabled={saving}
          className="w-full bg-red-600 hover:bg-red-700 text-white py-6"
        >
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : 'Save Delivery Settings'}
        </Button>
      </div>
    </AdminSettingsPageLayout>
  );
}

function DeliveryZonesManager() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newZone, setNewZone] = useState({
    zone_name: '',
    min_distance_km: '',
    max_distance_km: '',
    charge: '',
  });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editZone, setEditZone] = useState({
    zone_name: '',
    min_distance_km: '',
    max_distance_km: '',
    charge: '',
  });

  useEffect(() => {
    void loadZones();
  }, []);

  async function loadZones() {
    try {
      const response = await client.apiCall.invoke({
        url:
          '/api/v1/entities/delivery_zones' +
          '?sort=min_distance_km&limit=50',
        method: 'GET',
      });
      setZones(response?.data?.items || []);
    } catch (error) {
      console.error(error);
      toast.error('Could not load delivery zones');
    } finally {
      setLoading(false);
    }
  }

  function validZone(zone: typeof newZone): boolean {
    return Boolean(
      zone.zone_name &&
        zone.min_distance_km !== '' &&
        zone.max_distance_km !== '' &&
        zone.charge !== '',
    );
  }

  async function addZone() {
    if (!validZone(newZone)) {
      toast.error('Fill all zone fields');
      return;
    }

    setAdding(true);
    try {
      await client.apiCall.invoke({
        url: '/api/v1/entities/delivery_zones',
        method: 'POST',
        data: {
          zone_name: newZone.zone_name,
          min_distance_km: Number(newZone.min_distance_km),
          max_distance_km: Number(newZone.max_distance_km),
          charge: Number(newZone.charge),
          is_active: true,
        },
      });
      setNewZone({
        zone_name: '',
        min_distance_km: '',
        max_distance_km: '',
        charge: '',
      });
      toast.success('Delivery zone added');
      await loadZones();
    } catch (error: any) {
      toast.error(error?.data?.detail || 'Could not add zone');
    } finally {
      setAdding(false);
    }
  }

  async function updateZone(id: number) {
    if (!validZone(editZone)) {
      toast.error('Fill all zone fields');
      return;
    }

    try {
      await client.apiCall.invoke({
        url: `/api/v1/entities/delivery_zones/${id}`,
        method: 'PUT',
        data: {
          zone_name: editZone.zone_name,
          min_distance_km: Number(editZone.min_distance_km),
          max_distance_km: Number(editZone.max_distance_km),
          charge: Number(editZone.charge),
        },
      });
      setEditingId(null);
      toast.success('Delivery zone updated');
      await loadZones();
    } catch (error: any) {
      toast.error(error?.data?.detail || 'Could not update zone');
    }
  }

  async function toggleZone(zone: Zone) {
    try {
      await client.apiCall.invoke({
        url: `/api/v1/entities/delivery_zones/${zone.id}`,
        method: 'PUT',
        data: { is_active: !zone.is_active },
      });
      await loadZones();
    } catch {
      toast.error('Could not change zone status');
    }
  }

  async function deleteZone(zone: Zone) {
    if (!window.confirm(`Delete zone "${zone.zone_name}"?`)) return;

    try {
      await client.apiCall.invoke({
        url: `/api/v1/entities/delivery_zones/${zone.id}`,
        method: 'DELETE',
      });
      toast.success('Delivery zone deleted');
      await loadZones();
    } catch (error: any) {
      toast.error(error?.data?.detail || 'Could not delete zone');
    }
  }

  if (loading) {
    return <p className="text-gray-500">Loading zones...</p>;
  }

  return (
    <div className="space-y-3">
      {zones.map(zone => (
        <div
          key={zone.id}
          className="p-3 bg-gray-800 rounded-lg border border-gray-700"
        >
          {editingId === zone.id ? (
            <div className="space-y-3">
              <ZoneInputs
                value={editZone}
                onChange={setEditZone}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => void updateZone(zone.id)}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <Check className="w-3 h-3 mr-1" />
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditingId(null)}
                  className="text-gray-400"
                >
                  <X className="w-3 h-3 mr-1" />
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Switch
                checked={zone.is_active !== false}
                onCheckedChange={() => void toggleZone(zone)}
              />

              <div className="flex-1">
                <p className="text-white font-medium text-sm">
                  {zone.zone_name}
                </p>
                <p className="text-gray-400 text-xs">
                  {zone.min_distance_km}–{zone.max_distance_km} km
                  {' → '}AED {zone.charge}
                </p>
              </div>

              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditingId(zone.id);
                  setEditZone({
                    zone_name: zone.zone_name,
                    min_distance_km: String(zone.min_distance_km),
                    max_distance_km: String(zone.max_distance_km),
                    charge: String(zone.charge),
                  });
                }}
                className="text-blue-400 p-1 h-auto"
              >
                <Pencil className="w-4 h-4" />
              </Button>

              <Button
                size="sm"
                variant="ghost"
                onClick={() => void deleteZone(zone)}
                className="text-red-400 p-1 h-auto"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      ))}

      {zones.length === 0 && (
        <p className="text-gray-500 text-sm">
          No delivery zones configured.
        </p>
      )}

      <div className="pt-4 border-t border-gray-700">
        <p className="text-gray-400 text-sm mb-2">
          Add New Zone
        </p>
        <ZoneInputs value={newZone} onChange={setNewZone} />
        <Button
          size="sm"
          onClick={() => void addZone()}
          disabled={adding}
          className="bg-red-600 hover:bg-red-700 text-white mt-3"
        >
          <Plus className="w-4 h-4 mr-1" />
          {adding ? 'Adding...' : 'Add Zone'}
        </Button>
      </div>
    </div>
  );
}

function ZoneInputs({
  value,
  onChange,
}: {
  value: {
    zone_name: string;
    min_distance_km: string;
    max_distance_km: string;
    charge: string;
  };
  onChange: (value: {
    zone_name: string;
    min_distance_km: string;
    max_distance_km: string;
    charge: string;
  }) => void;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      <Input
        value={value.zone_name}
        onChange={event =>
          onChange({ ...value, zone_name: event.target.value })
        }
        placeholder="Zone name"
        className="bg-gray-900 border-gray-700 text-white"
      />
      <Input
        type="number"
        value={value.min_distance_km}
        onChange={event =>
          onChange({
            ...value,
            min_distance_km: event.target.value,
          })
        }
        placeholder="Min km"
        className="bg-gray-900 border-gray-700 text-white"
      />
      <Input
        type="number"
        value={value.max_distance_km}
        onChange={event =>
          onChange({
            ...value,
            max_distance_km: event.target.value,
          })
        }
        placeholder="Max km"
        className="bg-gray-900 border-gray-700 text-white"
      />
      <Input
        type="number"
        value={value.charge}
        onChange={event =>
          onChange({ ...value, charge: event.target.value })
        }
        placeholder="AED"
        className="bg-gray-900 border-gray-700 text-white"
      />
    </div>
  );
}

function LocationMap({
  lat,
  lng,
  onLocationChange,
}: {
  lat: number;
  lng: number;
  onLocationChange: (lat: number, lng: number) => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl:
        'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
      iconUrl:
        'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
      shadowUrl:
        'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
    });

    const safeLat = Number.isFinite(lat) ? lat : 25.2747;
    const safeLng = Number.isFinite(lng) ? lng : 56.345;

    const map = L.map(mapRef.current).setView(
      [safeLat, safeLng],
      15,
    );

    L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        attribution:
          '&copy; OpenStreetMap contributors',
      },
    ).addTo(map);

    const marker = L.marker([safeLat, safeLng], {
      draggable: true,
    }).addTo(map);

    marker.bindPopup('Vita Napoli').openPopup();
    marker.on('dragend', () => {
      const position = marker.getLatLng();
      onLocationChange(position.lat, position.lng);
    });

    map.on('click', event => {
      marker.setLatLng(event.latlng);
      onLocationChange(event.latlng.lat, event.latlng.lng);
    });

    mapInstanceRef.current = map;
    markerRef.current = marker;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (
      markerRef.current &&
      mapInstanceRef.current &&
      Number.isFinite(lat) &&
      Number.isFinite(lng)
    ) {
      markerRef.current.setLatLng([lat, lng]);
      mapInstanceRef.current.setView([lat, lng]);
    }
  }, [lat, lng]);

  return (
    <div
      ref={mapRef}
      className="h-80 rounded-xl overflow-hidden border border-gray-700"
    />
  );
}
