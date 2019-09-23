import React, { Component } from 'react'
import Websocket from 'react-websocket';
import { BounceLoader } from 'react-spinners';
import {FlexibleWidthXYPlot, XAxis, YAxis, AreaSeries, Hint} from 'react-vis';
import '../../node_modules/react-vis/dist/style.css';

import TitleComponent from './TitleComponent';

export class Coinbase extends Component {

  constructor(props) {
    super(props);
    this.pair = 'DAI-USDC';
    this.priceLimit = 1.00;
    this.state = {};
    }

  componentDidMount = async() => {
    const supplyRates = await this.getUsdcAndDaiSupplyRates();
    this.setState({
        ...this.state,
        ...supplyRates,
    });
  }

  getUsdcAndDaiSupplyRates = async () => {
    const compoundData = await this.getCompoundData();
    const rates = compoundData.cToken
                    .filter((x) => (x.symbol === 'cUSDC' || x.symbol === 'cDAI'))
                    .map((x) => [x.symbol, parseFloat(x.supply_rate.value)]);
    const usdcSupplyRate = rates.filter((x) => x[0] === 'cUSDC')[0][1];
    const daiSupplyRate = rates.filter((x) => x[0] === 'cDAI')[0][1];
    return { usdcSupplyRate, daiSupplyRate }
  }

  getCompoundData = async () => {
    return fetch("https://api.compound.finance/api/v2/ctoken")
    .then((res) => res.json())
    .then((data) => {
        return data;
    })
    .catch((error) => {
        console.log(error);
    })
  }

  getSupplyDays() {
      const daiPrice = this.state.bids[0][0];
      const rateDifference = this.state.daiSupplyRate - this.state.usdcSupplyRate;
      return 365 * Math.log(daiPrice) / Math.log(1 + rateDifference);
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
    return result.filter(x => {return x[1] !== 0.0});
  }

  replaceBids = (bids, price, newAmount) => {
    let madeUpdate = false;
    let result = bids.map(ask => {
      if (ask[0] === price) {
        madeUpdate = true;
        return [price, newAmount]
      } else {
        return ask;
      }
    });
    if (!madeUpdate) {
      result.unshift([price, newAmount]);
      result = result.sort((a, b) => a[0] < b[0] ? 1 : -1);
    }
    return result.filter(x => {return x[1] !== 0.0});
  }

  sumUpToPriceLimit = (asks, priceLimit) => {
    let volume = 0;
    asks.forEach(order => {
      let price = order[0];
      let amount = order[1];
      if (price < priceLimit) {
        volume += amount;
      }
    })
    return volume;
  }

  sumDownToPriceLimit = (bids, priceLimit) => {
    let volume = 0;
    bids.forEach(order => {
      let price = order[0];
      let amount = order[1];
      if (price > priceLimit) {
        volume += amount;
      }
    })
    return volume;
  }

  parseSnapshot = (asks, bids) => {
    this.setState({
      volumeUpToLimit: this.sumUpToPriceLimit(asks, this.priceLimit),
      volumeDownToLimit: this.sumDownToPriceLimit(bids, this.priceLimit),
      asks: asks,
      bids: bids
    })
  }

  reportUpdate = data => {
    let newAsks = this.state.asks;
    let newBids = this.state.bids;
    data.changes.forEach(change => {
      let direction = change[0];
      let price = parseFloat(change[1]);
      let amount = parseFloat(change[2]);
      if (direction === 'sell') {
        newAsks = this.replaceAsks(newAsks, price, amount);
      } else {
        newBids = this.replaceBids(newBids, price, amount);
      }
    });
    this.setState({
      volumeUpToLimit: this.sumUpToPriceLimit(newAsks, this.priceLimit),
      volumeDownToLimit: this.sumDownToPriceLimit(newBids, this.priceLimit),
      asks: newAsks,
      bids: newBids
    });
  }

  handleData(data) {
    let json = JSON.parse(data);
    if (json.type === 'snapshot') {
      const asks = json.asks.map(row => row.map(x => parseFloat(x)));
      const bids = json.bids.map(row => row.map(x => parseFloat(x)));
      this.parseSnapshot(asks, bids);
    }
    if (json.type === 'l2update') {
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

  reshapeAsksForChart = asks => {
    let cumulativeAmount = 0;
    let results = asks.map(row => {
        cumulativeAmount += row[1];
        return {x: row[0], y: cumulativeAmount};
    })
    return results.filter(row => row.x < this.priceLimit);
  }

  reshapeBidsForChart = bids => {
    let cumulativeAmount = 0;
    let results = bids.map(row => {
        cumulativeAmount += row[1];
        return {x: row[0], y: cumulativeAmount};
    })
    return results.filter(row => row.x > this.priceLimit);
  }

  hasLoaded() {
    return this.state.volumeUpToLimit !== undefined && this.state.daiSupplyRate;
  }

  hasCheapDai() {
    return this.state.volumeDownToLimit === 0;
  }

  render() {

    let dollarVolume, title, h3text, data, sign, color, tickValues, compoundDays;
    if (this.hasLoaded()) {
      if (this.hasCheapDai()) {
        dollarVolume = this.formatAsDollars(this.state.volumeUpToLimit);
        title = `${dollarVolume} DAI for sale on Coinbase below $${this.priceLimit}.`;
        h3text = `for sale on Coinbase below $${this.priceLimit}.`;
        data = this.reshapeAsksForChart(this.state.asks);
        sign = '≤';
        color = '#ff6c4e';
        tickValues = [this.state.asks[0][0], this.priceLimit];
      } else {
        dollarVolume = this.formatAsDollars(this.state.volumeDownToLimit);
        title = `${dollarVolume} DAI you can sell on Coinbase above $${this.priceLimit}.`
        h3text = `you can sell on Coinbase above $${this.priceLimit}.`;  
        data = this.reshapeBidsForChart(this.state.bids);
        sign = '≥';
        color = '#12939a';
        tickValues = [this.priceLimit, this.state.bids[0][0]];
        compoundDays = Math.round(this.getSupplyDays());
      }
    }
    
    return (
      <div className="cover-container d-flex w-100 h-100 p-3 mx-auto flex-column">
        
        {this.hasLoaded() ? 
        <React.Fragment>
          <main role="main" className="inner cover">
          <h1 className="cover-heading">{dollarVolume}</h1>
          <h2>DAI</h2>
          <h3 className="mb-4">{h3text}</h3>
          <FlexibleWidthXYPlot
            height={300}
            onMouseLeave={() => this.setState({value: undefined})}
            xDomain={tickValues}
            >
            <XAxis
              style={{
                line: {stroke: '#FFF'},
                text: {stroke: 'none', fill: '#FFF', fontSize: '1em'}
              }}
              tickValues={tickValues}
              tickFormat={v => `$${v}`}
            />
            <YAxis
              hideTicks
              hideLine
            />
              <AreaSeries
                data={data}
                color={color}
                onNearestX={datapoint => {
                  this.setState({value: datapoint});
                }}
              />
              {this.state.value && 
              <Hint value={this.state.value}>
                <p>{this.formatAsDollars(this.state.value.y)
                   + ` ${sign} $` + this.state.value.x}
                </p>
              </Hint>
              }
          </FlexibleWidthXYPlot>
          <p>Bid: ${this.state.bids[0][0]} |
             Ask: ${this.state.asks[0][0]}
          </p>
          <p>Premium = ~{compoundDays} days worth of Compound lending</p>
          </main>
          <footer className="mastfoot mt-4">
          <div className="inner">
            <p>Made by <a href="https://twitter.com/ASvanevik">@ASvanevik</a></p>
          </div>
          </footer>
          <TitleComponent
            title={title}
          />
          
        </React.Fragment>
        :
        <BounceLoader
          loading={!this.hasLoaded()}
          color={'#FFF'}
          css={{display: 'block', margin: 'auto', marginTop: '50%'}}
        />
        }

        <Websocket url='wss://ws-feed.pro.coinbase.com'
          onMessage={this.handleData.bind(this)}
          onOpen={this.subscribe.bind(this)}
          ref={Websocket => {
            this.refWebSocket = Websocket;
          }}
          />
      </div>
    )
  }
}

export default Coinbase;
