document.addEventListener('DOMContentLoaded', () => {

    // ─── 1. Navbar Scroll Effect ────────────────────────────────
    const navbar = document.getElementById('navbar');

    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    }, { passive: true });

    // ─── 2. Intersection Observer for Fade-In Animations ────────
    const scrollObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target);
            }
        });
    }, {
        root: null,
        rootMargin: '0px 0px -60px 0px',
        threshold: 0.1
    });

    document.querySelectorAll('.animate-on-scroll').forEach(el => {
        scrollObserver.observe(el);
    });

    // ─── 3. Number Counter Animation ────────────────────────────
    const statsObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const el = entry.target;
                const target = parseInt(el.getAttribute('data-target'), 10);
                const suffix = el.querySelector('.stat-suffix');
                const suffixText = suffix ? suffix.textContent : '';

                if (target === 0) {
                    el.textContent = '0';
                    if (suffix) el.appendChild(suffix);
                    observer.unobserve(el);
                    return;
                }

                let current = 0;
                const duration = 1800;
                const steps = 40;
                const increment = Math.ceil(target / steps);
                const interval = duration / steps;

                const timer = setInterval(() => {
                    current += increment;
                    if (current >= target) {
                        current = target;
                        clearInterval(timer);
                    }
                    el.textContent = current;
                    if (suffix) {
                        const newSuffix = document.createElement('span');
                        newSuffix.className = 'stat-suffix';
                        newSuffix.textContent = suffixText;
                        el.appendChild(newSuffix);
                    }
                }, interval);

                observer.unobserve(el);
            }
        });
    }, { threshold: 0.5 });

    document.querySelectorAll('.stat-number').forEach(el => {
        statsObserver.observe(el);
    });

    // ─── 4. Smooth Scrolling ────────────────────────────────────
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href === '#') return;

            e.preventDefault();
            const target = document.querySelector(href);

            if (target) {
                const offset = 80;
                const pos = target.getBoundingClientRect().top + window.pageYOffset - offset;
                window.scrollTo({ top: pos, behavior: 'smooth' });
            }
        });
    });

    // ─── 5. Subtle Parallax on Hero Glows ───────────────────────
    const heroGlows = document.querySelectorAll('.hero-glow');

    window.addEventListener('mousemove', (e) => {
        const x = (e.clientX / window.innerWidth - 0.5) * 20;
        const y = (e.clientY / window.innerHeight - 0.5) * 20;

        heroGlows.forEach((glow, i) => {
            const factor = i === 0 ? 1 : -0.6;
            glow.style.transform = `translate(calc(-50% + ${x * factor}px), ${y * factor}px)`;
        });
    }, { passive: true });

});
