import React from 'react';
import Drawer from 'material-ui/Drawer';
import List from 'material-ui/List';
import ListItem from 'material-ui/List/ListItem';
import World from 'material-ui/svg-icons/social/public';
import RaisedButton from 'material-ui/RaisedButton';
import {Motion, spring} from 'react-motion';

export default class Navigation extends React.Component {

  constructor(props) {
    super(props);
    this.state = {
        expand: false,
        width: 54
    };
    
    this.onMouseOver = this.onMouseOver.bind(this);
    this.onMouseOut = this.onMouseOut.bind(this);
  }

  onMouseOver() {
    this.setState({expand: true});
  }
  
  onMouseOut() {
    this.setState({expand: false});
  }
  

  render() {
    return (
        <div>
          <Motion style={{x: spring(this.state.expand ? 200 : 52)}}>
            {({x}) =>
              <Drawer
                open={true}
                width={x}
                containerStyle={{
                  top: '64px'
                }}
                style={{
                  transition: 'width'
                }}
              >
                <List
                  onMouseEnter={this.onMouseOver}
                  onMouseLeave={this.onMouseOut}
                >
                  <ListItem 
                    primaryText="Global" 
                    leftIcon={<World />}
                    initiallyOpen={true}
                    primaryTogglesNestedList={true}
                    nestedItems={[
                      <ListItem
                        key={1}
                        primaryText="MM Stats"
                      />,
                      <ListItem
                        key={2}
                        primaryText="Distributions"
                      />
                    ]}
                  />
                </List>
              </Drawer>
            }
          </Motion>
        </div>
    );
  }
}