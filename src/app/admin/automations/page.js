import AutomationBuilder from '@/components/automations/AutomationBuilder';

export const metadata = {
  title: 'Automations Builder | Costa Peptides',
};

export default function AutomationsPage() {
  return (
    <div className="bg-gray-100 min-h-screen">
      {/* Mobile warning overlay */}
      <div className="md:hidden flex items-center justify-center min-h-screen p-6 text-center bg-white z-50 absolute inset-0">
        <div>
          <h2 className="text-2xl font-bold text-red-600 mb-2">Desktop Only</h2>
          <p className="text-gray-600">
            The Automation Engine visual builder is too complex for mobile screens. 
            Please access this page on a desktop or laptop device.
          </p>
        </div>
      </div>
      
      {/* Desktop view */}
      <div className="hidden md:block h-screen">
        <AutomationBuilder />
      </div>
    </div>
  );
}
