export default function Footer() {
  return (
    <footer className="border-t border-ink/10">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-10 text-[13px] text-ink/55 md:flex-row md:justify-between md:px-6">
        <p>© {new Date().getFullYear()} FootPlay</p>
        <ul className="flex items-center gap-6">
          <li>
            <span>About</span>
          </li>
          <li>
            <span>Contact</span>
          </li>
        </ul>
      </div>
    </footer>
  );
}
