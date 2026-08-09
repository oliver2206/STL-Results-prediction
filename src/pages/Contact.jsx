import { useState } from 'react';
import './Contact.css';

export default function Contact() {
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [sent, setSent] = useState(false);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    setSent(true);
  }

  return (
    <section className="section contact-page">
      <div className="wrap contact-grid">
        <div className="contact-info">
          <span className="eyebrow">Get in touch</span>
          <h1>Questions before you book?</h1>
          <p>Text is usually fastest. We reply between 7am and 11pm daily.</p>

          <div className="info-list">
            <div className="info-item">
              <h3>Call or text</h3>
              <p>0917 123 4567</p>
            </div>
            <div className="info-item">
              <h3>Email</h3>
              <p>stay@tuloyinn.ph</p>
            </div>
            <div className="info-item">
              <h3>Address</h3>
              <p>142 Session Extension Road, Barangay Kagitingan, Baguio City, 2600</p>
            </div>
            <div className="info-item">
              <h3>Reception hours</h3>
              <p>Open 24 hours, every day</p>
            </div>
          </div>
        </div>

        <div className="contact-form-wrap">
          {sent ? (
            <div className="contact-sent">
              <h2>Message sent</h2>
              <p>Thanks, {form.name.split(' ')[0] || 'friend'}. We'll get back to you at {form.email || 'your email'} soon.</p>
              <button className="btn btn-primary" onClick={() => { setSent(false); setForm({ name: '', email: '', message: '' }); }}>
                Send another message
              </button>
            </div>
          ) : (
            <form className="contact-form" onSubmit={handleSubmit}>
              <label className="field">
                <span>Name</span>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => update('name', e.target.value)}
                  placeholder="Your name"
                />
              </label>
              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => update('email', e.target.value)}
                  placeholder="you@email.com"
                />
              </label>
              <label className="field">
                <span>Message</span>
                <textarea
                  rows="5"
                  required
                  value={form.message}
                  onChange={(e) => update('message', e.target.value)}
                  placeholder="Ask about rooms, group rates, or anything else"
                />
              </label>
              <button type="submit" className="btn btn-primary contact-submit">Send message</button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
