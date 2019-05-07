import React from 'react';
import Helmet from 'react-helmet';

export default function TitleComponent(props) {
  const defaultTitle = 'DAI / USDC';
  return (
    <Helmet defer={false}>
      <title>{props.title ? props.title : defaultTitle}</title>
    </Helmet>
  )
}
