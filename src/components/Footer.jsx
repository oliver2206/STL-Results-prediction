import { Link } from 'react-router-dom';
import './Footer.css';

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="banig" />
      <div className="wrap footer-inner">
        <div className="footer-col">
          <h4>Tuloy Inn</h4>
          <p>142 Session Extension Road,<br />Barangay Kagitingan, Baguio City</p>
          <p>Open 24 hours. Tuloy po kayo, anumang oras.</p>
        </div>
        <div className="footer-col">
          <h4>Get here</h4>
          <p>7-minute walk from the Baguio public market</p>
          <p>15 minutes from the Genesis / Victory Liner terminal</p>
        </div>
        <div className="footer-col">
          <h4>Talk to us</h4>
          <p>0917 123 4567</p>
          <p>stay@tuloyinn.ph</p>
          <Link to="/contact" className="footer-link">Send a message &rarr;</Link>
        </div>
      </div>
      <div className="wrap footer-bottom">
        <span>&copy; {new Date().getFullYear()} Tuloy Inn Baguio. A little room, honestly priced.</span>
      </div>
    </footer>
  );
}
