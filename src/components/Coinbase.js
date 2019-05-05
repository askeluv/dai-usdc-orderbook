import React, { Component } from 'react'
import Websocket from 'react-websocket';
import { BounceLoader } from 'react-spinners';

export class Coinbase extends Component {

  constructor(props) {
    super(props);
    this.pair = 'DAI-USDC';
    this.priceLimit = 1;
    this.state = {};
    }

  formatAsDollars = x => {
    return '$' + x.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,');
  };

  replaceAsks = (asks, price, newAmount) => {
    let madeUpdate = false;
    let result = asks.map(ask => {
      if (ask[0] === price) {
        madeUpdate = true;
        return [price, newAmount]
      } else {
        return ask;
      }
    });
    if (!madeUpdate) {
      result.unshift([price, newAmount]);
      result = result.sort((a, b) => a[0] > b[0] ? 1 : -1);
    }
    return result;
  }

  sumUpToPriceLimit = (orders, priceLimit) => {
    let volume = 0;
    orders.forEach(order => {
      let price = order[0];
      let amount = order[1];
      if (price < priceLimit) {
        volume += price * amount;
      }
    })
    return volume;
  }

  parseSnapshot = asks => {
    let newVol = this.sumUpToPriceLimit(asks, this.priceLimit);
    this.setState({
      volumeUpToLimit: newVol,
      asks: asks
    })
  }

  reportUpdate = data => {
    let newAsks = this.state.asks;
    data.changes.forEach(change => {
      let direction = change[0];
      let price = parseFloat(change[1]);
      let amount = parseFloat(change[2]);
      if (direction === 'sell') {
        newAsks = this.replaceAsks(newAsks, price, amount);
      }
    });
    let newVol = this.sumUpToPriceLimit(newAsks, this.priceLimit);
    this.setState({
      volumeUpToLimit: newVol,
      asks: newAsks
    });
  }

  handleData(data) {
    let json = JSON.parse(data);
    if (json.type === 'snapshot') {
      console.log('snapshot');
      this.parseSnapshot(json.asks.map(row => row.map(x => parseFloat(x))));
    }
    if (json.type === 'l2update') {
      console.log('l2update');
      this.reportUpdate(json);
    }
  }

  sendMessage(message){
    this.refWebSocket.sendMessage(message);
  }
  
  subscribe() {
    this.sendMessage(JSON.stringify({
        "type": "subscribe",
        "channels": [{ "name": "level2", "product_ids": [ this.pair ] }],
      })
    )
  }

  hasLoaded() {
    return this.state.volumeUpToLimit !== undefined;
  }

  render() {
    return (
      <div className="cover-container d-flex w-100 h-100 p-3 mx-auto flex-column">
        <main role="main" className="inner cover">
        
        {this.hasLoaded() ? 
        <React.Fragment>
          <h1 className="cover-heading">
            {this.formatAsDollars(this.state.volumeUpToLimit)}
          </h1>
          <h2>DAI</h2>
          <h3>for sale on Coinbase</h3>
          <h4>below ${this.priceLimit}</h4>
        </React.Fragment>
        :
        <BounceLoader
          loading={!this.hasLoaded()}
          color={'#FFF'}
          css={{display: 'block', margin: 'auto'}}
        />
        }

        <Websocket url='wss://ws-feed.pro.coinbase.com'
          onMessage={this.handleData.bind(this)}
          onOpen={this.subscribe.bind(this)}
          ref={Websocket => {
            this.refWebSocket = Websocket;
          }}
          />

        </main>
      </div>
    )
  }
}

export default Coinbase;
