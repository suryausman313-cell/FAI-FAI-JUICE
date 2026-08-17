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
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // ignore bad local data
      }
    }

    return LANGUAGES.map(language => ({
      code: language.code,
      enabled: true,
      isDefault: language.code === 'en',
    }));
  });

  function toggleLanguage(code: Language) {
    setLanguages(previous => {
      const selected = previous.find(language => language.code === code);

      if (selected?.isDefault) {
        toast.error('Cannot disable the default language');
        return previous;
      }

      return previous.map(language =>
        language.code === code
          ? { ...language, enabled: !language.enabled }
          : language,
      );
    });
  }

  function setDefault(code: Language) {
    setLanguages(previous =>
      previous.map(language => ({
        ...language,
        isDefault: language.code === code,
        enabled: language.code === code ? true : language.enabled,
      })),
    );
  }

  function saveConfig() {
    localStorage.setItem(
      'admin_languages_config',
      JSON.stringify(languages),
    );
    toast.success('Language settings saved!');
  }

  return (
    <div
      dir="ltr"
      className="min-h-screen bg-gray-950 text-white"
      style={{ direction: 'ltr' }}
    >
      <header className="sticky top-0 z-50 bg-gray-950/95 backdrop-blur-sm border-b border-gray-800">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/admin')}
            className="text-gray-400 hover:text-white cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>

          <Globe className="w-5 h-5 text-green-500" />
          <h1 className="text-lg font-bold">Language Management</h1>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <Card className="bg-blue-600/10 border-blue-600/30 p-4">
          <div className="flex items-start gap-3">
            <Languages className="w-5 h-5 text-blue-400 mt-0.5" />
            <div>
              <h3 className="text-blue-400 font-semibold text-sm">
                Customer App Languages
              </h3>
              <p className="text-blue-400/70 text-xs mt-1">
                Enable or disable the languages that are already translated in the app.
                Customer Arabic remains RTL, while Admin, Kitchen and Rider screens stay LTR.
              </p>
            </div>
          </div>
        </Card>

        <div className="space-y-3">
          <h2 className="text-white font-semibold text-sm">
            Available Languages
          </h2>

          {LANGUAGES.map(languageInfo => {
            const config = languages.find(
              language => language.code === languageInfo.code,
            );
            const isEnabled = config?.enabled ?? true;
            const isDefault = config?.isDefault ?? false;

            return (
              <Card
                key={languageInfo.code}
                className={`bg-gray-900 border-gray-800 p-4 ${
                  isDefault ? 'ring-1 ring-green-600/50' : ''
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <span className="text-2xl shrink-0">{languageInfo.flag}</span>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-white font-semibold">
                          {languageInfo.nativeName}
                        </h3>
                        <span className="text-gray-500 text-sm">
                          ({languageInfo.name})
                        </span>

                        {isDefault && (
                          <span className="bg-green-600 text-white text-[10px] px-2 py-0.5 rounded-full font-medium">
                            DEFAULT
                          </span>
                        )}
                      </div>

                      <p className="text-gray-500 text-xs mt-0.5">
                        Direction: {languageInfo.dir.toUpperCase()} • Code:{' '}
                        {languageInfo.code}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    {!isDefault && isEnabled && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDefault(languageInfo.code)}
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
                        onCheckedChange={() =>
                          toggleLanguage(languageInfo.code)
                        }
                        disabled={isDefault}
                      />
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        <Card className="bg-gray-900 border-gray-800 p-4">
          <h3 className="text-white font-semibold text-sm mb-2">
            RTL / LTR Rules
          </h3>
          <p className="text-gray-400 text-xs">
            Customer Arabic and Urdu use RTL. Customer English uses LTR.
            Admin, Kitchen and Rider management screens always stay LTR so
            customer language selection cannot flip staff screens.
          </p>

          <div className="flex flex-wrap gap-3 mt-3">
            <span className="bg-green-600/20 text-green-400 text-xs px-2 py-1 rounded">
              <Check className="w-3 h-3 inline mr-1" />
              Arabic Customer RTL
            </span>
            <span className="bg-green-600/20 text-green-400 text-xs px-2 py-1 rounded">
              <Check className="w-3 h-3 inline mr-1" />
              Urdu Customer RTL
            </span>
            <span className="bg-green-600/20 text-green-400 text-xs px-2 py-1 rounded">
              <Check className="w-3 h-3 inline mr-1" />
              Staff Screens LTR
            </span>
          </div>
        </Card>

        <Card className="bg-amber-600/10 border-amber-600/30 p-4">
          <h3 className="text-amber-300 font-semibold text-sm mb-2">
            Adding a brand-new language
          </h3>
          <p className="text-amber-200/70 text-xs">
            This page can safely control languages already translated in the app.
            A brand-new language also needs its full app translations and menu
            translations before it can be offered to customers. It should not be
            added as an empty language because customers would see English or
            translation keys.
          </p>
        </Card>

        <Button
          onClick={saveConfig}
          className="w-full bg-green-600 hover:bg-green-700 text-white py-3 font-semibold rounded-xl cursor-pointer"
        >
          Save Language Settings
        </Button>
      </div>
    </div>
  );
}
