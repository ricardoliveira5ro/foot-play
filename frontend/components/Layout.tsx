import Footer from './Footer';
import Navbar from './Navbar';

/** Site shell: fixed navbar on top, page content, footer at the bottom. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
