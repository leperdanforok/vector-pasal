export default function MaintenancePage() {
  return (
    <div className="flex h-screen flex-col items-center justify-center bg-[#F8F5F0] px-4 text-center">
      <h1 className="text-4xl font-bold text-[#1A1A1A] mb-4">Vector Pasal Bolmong</h1>
      <div className="h-1 w-20 bg-[#D4AF37] mb-6"></div>
      <p className="text-lg text-gray-600 max-w-md">
        Mohon maaf, kami sedang maintenante kami akan segera kembali.
      </p>
      <p className="mt-8 text-sm font-mono text-gray-400">Status: Data Collection Phase</p>
    </div>
  );
}