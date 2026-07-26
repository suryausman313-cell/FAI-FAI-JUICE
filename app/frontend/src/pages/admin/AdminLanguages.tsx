import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Globe, Check, Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { LANGUAGES, Language } from '@/lib/i18n';

interface LanguageConfig {
  code: Language;
  enabled: boolean;
  isDefault: boolean;
}

export default function AdminLanguages() {
  const navigate = useNavigate();
  const [languages, setLanguages] = useState<LanguageConfig[]>(() => {
    const saved = localStorage.getItem('admin_languages_config');
    if (saved) {
      try { return JSON.parse(saved); } catch { /* ignore */ }
    }
    return LANGUAGES.map(l => ({
      code: l.code,
      enabled: true,
      isDefault: l.code === 'en',
    }));
  });

  function toggleLanguage(code: Language) {
    setLanguages(prev => {
      const lang = prev.find(l => l.code === code);
      if (lang?.isDefault) {
        toast.error('Cannot disable the default language');
        return prev;
      }
      return prev.map(l =>
        l.code === code ? { ...l, enabled: !l.enabled } : l
      );
    });
  }

  function setDefault(code: Language) {
    setLanguages(prev =>
      prev.map(l => ({
        ...l,
        isDefault: l.code === code,
        enabled: l.code === code ? true : l.enabled,
      }))
    );
  }

  function saveConfig() {
    localStorage.setItem('admin_languages_config', JSON.stringify(languages));
    toast.success('Language settings saved!');
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="sticky top-0 z-50 bg-gray-950/95 backdrop-blur-sm border-b border-gray-800">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/admin/settings')}
            className="text-gray-400 hover:text-white cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <Globe className="w-5 h-5 text-red-500" />
          <h1 className="text-lg font-bold">Language Management</h1>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Info Card */}
        <Card className="bg-blue-600/10 border-blue-600/30 p-4">
          <div className="flex items-start gap-3">
            <Languages className="w-5 h-5 text-blue-400 mt-0.5" />
            <div>
              <h3 className="text-blue-400 font-semibold text-sm">Multi-Language Support</h3>
              <p className="text-blue-400/70 text-xs mt-1">
                Enable or disable languages for your customer app. The default language is shown when a customer first visits.
                Customers can switch languages using the language picker in the header.
              </p>
            </div>
          </div>
        </Card>

        {/* Language List */}
        <div className="space-y-3">
          <h2 className="text-white font-semibold text-sm">Available Languages</h2>
          {LANGUAGES.map(langInfo => {
            const config = languages.find(l => l.code === langInfo.code);
            const isEnabled = config?.enabled ?? true;
            const isDefault = config?.isDefault ?? false;

            return (
              <Card
                key={langInfo.code}
                className={`bg-gray-900 border-gray-800 p-4 ${isDefault ? 'ring-1 ring-red-600/50' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="text-2xl">{langInfo.flag}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-white font-semibold">{langInfo.nativeName}</h3>
                        <span className="text-gray-500 text-sm">({langInfo.name})</span>
                        {isDefault && (
                          <span className="bg-red-600 text-white text-[10px] px-2 py-0.5 rounded-full font-medium">
                            DEFAULT
                          </span>
                        )}
                      </div>
                      <p className="text-gray-500 text-xs mt-0.5">
                        Direction: {langInfo.dir.toUpperCase()} • Code: {langInfo.code}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {!isDefault && isEnabled && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDefault(langInfo.code)}
                        className="text-xs border-gray-700 text-gray-400 hover:text-white cursor-pointer"
                      >
                        Set Default
                      </Button>
                    )}
                    <div className="flex items-center gap-2">
                      <Label className="text-gray-500 text-xs">
                        {isEnabled ? 'Active' : 'Disabled'}
                      </Label>
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={() => toggleLanguage(langInfo.code)}
                        disabled={isDefault}
                      />
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* RTL Support Info */}
        <Card className="bg-gray-900 border-gray-800 p-4">
          <h3 className="text-white font-semibold text-sm mb-2">RTL (Right-to-Left) Support</h3>
          <p className="text-gray-400 text-xs">
            Arabic and Urdu automatically use RTL layout. When a customer selects one of these languages,
            the entire app interface mirrors to support right-to-left reading direction. This includes
            navigation, text alignment, icons, and all UI elements.
          </p>
          <div className="flex gap-3 mt-3">
            <span className="bg-green-600/20 text-green-400 text-xs px-2 py-1 rounded">
              <Check className="w-3 h-3 inline mr-1" />Arabic RTL
            </span>
            <span className="bg-green-600/20 text-green-400 text-xs px-2 py-1 rounded">
              <Check className="w-3 h-3 inline mr-1" />Urdu RTL
            </span>
            <span className="bg-green-600/20 text-green-400 text-xs px-2 py-1 rounded">
              <Check className="w-3 h-3 inline mr-1" />English LTR
            </span>
          </div>
        </Card>

        {/* Menu Translations Info */}
        <Card className="bg-gray-900 border-gray-800 p-4">
          <h3 className="text-white font-semibold text-sm mb-2">Menu Item Translations</h3>
          <p className="text-gray-400 text-xs">
            Menu item names and descriptions are displayed as entered in the admin panel.
            For multi-language menu content, you can add translated names in the item description
            or create separate items per language category. The UI labels (buttons, navigation, headings)
            are automatically translated based on the selected language.
          </p>
        </Card>

        {/* Save Button */}
        <Button
          onClick={saveConfig}
          className="w-full bg-red-600 hover:bg-red-700 text-white py-3 font-semibold rounded-xl cursor-pointer"
        >
          Save Language Settings
        </Button>
      </div>
    </div>
  );
}