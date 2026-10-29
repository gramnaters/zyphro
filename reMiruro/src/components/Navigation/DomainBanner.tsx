import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Ic } from '../../live/Icon';

const MESSAGE = "You're using the correct domain. miruro.cx is our primary domain.";

export function DomainBanner() {
  const [hidden, setHidden] = useState(
    () => sessionStorage.getItem('miruro-domain-banner') === '1',
  );

  if (hidden) return null;

  return (
    <div className='_stack_1dw23_1'>
      <div
        className='_banner_1dw23_8 _panel_1vrzc_1'
        data-appearance='aggressive'
        role='status'
        style={{ '--msg-color': '#2EAD63' } as React.CSSProperties}
      >
        <div className='_messageContent_1dw23_23 '>
          <Ic n='checkCircle' className='_icon_1dw23_68' />
          <span className='_text_1dw23_74'>
            <span>
              You&apos;re using the correct domain. <strong>miruro.cx</strong> is our primary domain.
            </span>
            <Link className='_cta_1dw23_88' to='/announcements'>
              announcements
            </Link>
          </span>
        </div>
        <button
          type='button'
          aria-label={`Dismiss ${MESSAGE}`}
          className='_close_1dw23_129'
          onClick={() => {
            sessionStorage.setItem('miruro-domain-banner', '1');
            setHidden(true);
          }}
        >
          <Ic n='times' />
        </button>
      </div>
    </div>
  );
}
