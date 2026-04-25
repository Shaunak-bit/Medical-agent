import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import PoweredBy from "./components/PoweredBy";
import Features from "./components/Features";
import CTA from "./components/CTA";
import Footer from "./components/Footer";

export default function Home() {
  return (
    <main className="min-h-screen">
      <Navbar />
      <Hero />
      <PoweredBy />
      <Features />
      <CTA />
      <Footer />
    </main>
  );
}