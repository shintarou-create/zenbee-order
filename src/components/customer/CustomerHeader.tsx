export default function CustomerHeader() {
  return (
    <header className="bg-fukamidori sticky top-0 z-10 shadow-md">
      <div className="max-w-2xl mx-auto px-4 py-2 flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="善兵衛農園"
          className="h-11 w-auto object-contain"
        />
      </div>
    </header>
  )
}
