#[starknet::interface]
pub trait ISalaryCreditLine<TState> {
    fn set_credit_line(ref self: TState, user: ContractAddress, limit: u256, apr_bps: u32);
    fn draw(ref self: TState, amount: u256);
    fn repay(ref self: TState, amount: u256);
    fn get_position(self: @TState, user: ContractAddress) -> (u256, u256, u32);
}

#[derive(Copy, Drop, Serde, starknet::Store)]
struct Position {
    limit: u256,
    outstanding: u256,
    apr_bps: u32,
}

#[starknet::contract]
pub mod SalaryCreditLine {
    use super::Position;
    use starknet::{get_caller_address, ContractAddress};
    use core::num::traits::Zero;

    #[storage]
    struct Storage {
        owner: ContractAddress,
        positions: LegacyMap<ContractAddress, Position>,
    }

    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress) {
        self.owner.write(owner);
    }

    fn only_owner(self: @ContractState) {
        assert(get_caller_address() == self.owner.read(), 'not-owner');
    }

    #[abi(embed_v0)]
    impl SalaryCreditLineImpl of super::ISalaryCreditLine<ContractState> {
        // MVP trust model: backend verifies Reclaim proof off-chain and sets user line.
        fn set_credit_line(ref self: ContractState, user: ContractAddress, limit: u256, apr_bps: u32) {
            only_owner(@self);
            let current = self.positions.read(user);
            self.positions.write(
                user,
                Position {
                    limit,
                    outstanding: current.outstanding,
                    apr_bps,
                },
            );
        }

        fn draw(ref self: ContractState, amount: u256) {
            let caller = get_caller_address();
            let mut position = self.positions.read(caller);

            let next = position.outstanding + amount;
            assert(next <= position.limit, 'limit-exceeded');

            position.outstanding = next;
            self.positions.write(caller, position);
        }

        fn repay(ref self: ContractState, amount: u256) {
            let caller = get_caller_address();
            let mut position = self.positions.read(caller);

            if amount >= position.outstanding {
                position.outstanding = Zero::zero();
            } else {
                position.outstanding = position.outstanding - amount;
            };

            self.positions.write(caller, position);
        }

        fn get_position(self: @ContractState, user: ContractAddress) -> (u256, u256, u32) {
            let p = self.positions.read(user);
            (p.limit, p.outstanding, p.apr_bps)
        }
    }
}
