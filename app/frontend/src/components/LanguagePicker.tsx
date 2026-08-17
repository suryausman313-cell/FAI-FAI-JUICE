import { useI18n, LANGUAGES, Language } from '@/lib/i18n';
import { Globe } from 'lucide-react';

export function LanguagePickerModal() {
  const { setLanguage, hasChosenLanguage, setHasChosenLanguage } = useI18n();

  if (hasChosenLanguage) return null;

  function handleSelect(lang: Language) {
    setLanguage(lang);
    setHasChosenLanguage(true);
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center px-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm animate-in fade-in zoom-in duration-300">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-red-600/20 rounded-full flex items-center justify-center mx-auto mb-3">
            <Globe className="w-7 h-7 text-red-500" />
          </div>
          <h2 className="text-white text-xl font-bold">Choose Language</h2>
          <p className="text-gray-400 text-sm mt-1">اختر اللغة • زبان منتخب کریں</p>
        </div>

        <div className="space-y-3">
          {LANGUAGES.map(lang => (
            <button
              key={lang.code}
              onClick={() => handleSelect(lang.code)}
              className="w-full flex items-center gap-4 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-red-600/50 rounded-xl px-4 py-4 transition-all cursor-pointer group"
            >
              <span className="text-2xl">{lang.flag}</span>
              <div className="flex-1 text-left">
                <p className="text-white font-semibold group-hover:text-red-400 transition-colors">
                  {lang.nativeName}
                </p>
                <p className="text-gray-500 text-xs">{lang.name}</p>
              </div>
              <div className="text-gray-600 text-xs uppercase">{lang.code}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LanguageSwitcher() {
  const { language, setLanguage, t } = useI18n();
  const currentLang = LANGUAGES.find(l => l.code === language);

  return (
    <div className="relative group">
      <button
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-gray-800 border border-gray-700 hover:border-gray-600 text-gray-300 text-xs cursor-pointer transition-colors"
        title={t('lang.change')}
      >
        <span className="text-sm">{currentLang?.flag}</span>
        <span className="uppercase font-medium">{language}</span>
      </button>
      <div className="absolute top-full right-0 mt-1 bg-gray-900 border border-gray-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 min-w-[140px]">
        {LANGUAGES.map(lang => (
          <button
            key={lang.code}
            onClick={() => setLanguage(lang.code)}
            className={`w-full flex items-center gap-2 px-3 py-2 text-sm cursor-pointer transition-colors first:rounded-t-lg last:rounded-b-lg ${
              language === lang.code
                ? 'bg-red-600/20 text-red-400'
                : 'text-gray-300 hover:bg-gray-800'
            }`}
          >
            <span>{lang.flag}</span>
            <span>{lang.nativeName}</span>
          </button>
        ))}
      </div>
    </div>
  );
}